import dayjs from 'dayjs'
import { LooseProjectNameRequirement, Requirement, parsePipRequirementsLineLoosely } from 'pip-requirements-js'
import { parseTOML, traverseNodes } from 'toml-eslint-parser'
import { TOMLArray, TOMLKeyValue, TOMLNode, TOMLTable } from 'toml-eslint-parser/lib/ast'
import { Visitor } from 'toml-eslint-parser/lib/traverse'
import vscode from 'vscode'
import { PyPI, outputChannel  } from './utils'
import { LRUCache } from 'lru-cache'

//FIXME type.ts
type RawRange = [startLine: number, startCharacter: number, endLine: number, endCharacter: number]

interface PositionLike {
    line: number
    character: number
}

interface RangeLike {
    start: PositionLike
    end: PositionLike
}

interface TextDocumentLike {
    lineCount: number
    lineAt(line: number): { text: string; range: RangeLike }
    getText(): string
}

//FIXME requirements.ts
function extractRequirementsFromPipRequirements(
    document: TextDocumentLike
): [LooseProjectNameRequirement, RawRange][] {
    const requirements: [LooseProjectNameRequirement, RawRange][] = []
    for (let line = 0; line < document.lineCount; line++) {
        let requirement: Requirement | null
        const { text, range } = document.lineAt(line)
        try {
            requirement = parsePipRequirementsLineLoosely(text)
        } catch {
            continue
        }
        if (requirement?.type !== 'ProjectName') continue
        requirements.push([requirement, [range.start.line, range.start.character, range.end.line, range.end.character]])
    }
    return requirements
}

//FIXME pyproject.ts
class PyprojectTOMLVisitor implements Visitor<TOMLNode> {
    /** Current table path. */
    private pathStack: (string | number)[] = []

    public dependencies: [LooseProjectNameRequirement, RawRange][] = []

    public enterNode(node: TOMLNode) {
        if (node.type === 'TOMLTable') {
            this.pathStack = node.resolvedKey.slice()
            this.potentiallyRegisterPoetryDependency(node)
            this.potentiallyRegisterPixiDependency(node)
        } else if (node.type === 'TOMLKeyValue') {
            this.pathStack.push(
                ...node.key.keys.map((key) => ('name' in key ? key.name : 'value' in key ? key.value : ''))
            )
            this.potentiallyRegisterPoetryDependency(node)
            this.potentiallyRegisterPixiDependency(node)
        } else if (node.type === 'TOMLArray') {
            this.potentiallyRegisterPep631Dependency(node)
            this.potentiallyRegisterPep735Dependency(node)
            this.potentiallyRegisterUvDependency(node)
            this.potentiallyRegisterBuildSystemDependency(node)
        }
    }

    public leaveNode(node: TOMLNode) {
        if (node.type === 'TOMLTable') {
            this.pathStack.length = 0
        } else if (node.type === 'TOMLKeyValue') {
            this.pathStack.pop()
        }
    }

    private potentiallyRegisterPoetryDependency(node: TOMLTable | TOMLKeyValue): void {
        if (this.pathStack[0] === 'tool' && this.pathStack[1] === 'poetry') {
            let projectName: string | undefined
            if (
                ['dependencies', 'dev-dependencies'].includes(this.pathStack[2] as string) &&
                this.pathStack.length === 4 &&
                typeof this.pathStack[3] === 'string'
            ) {
                // Basic dependencies and legacy dev dependencies
                projectName = this.pathStack[3]
            } else if (
                this.pathStack[2] === 'group' &&
                this.pathStack[4] === 'dependencies' &&
                this.pathStack.length === 6 &&
                typeof this.pathStack[5] === 'string'
            ) {
                // Dependency group
                projectName = this.pathStack[5]
            }
            if (projectName) {
                this.dependencies.push([
                    {
                        name: projectName,
                        type: 'ProjectName',
                    },
                    [node.loc.start.line - 1, node.loc.start.column, node.loc.end.line - 1, node.loc.end.column],
                ])
            }
        }
    }

    private potentiallyRegisterPixiDependency(node: TOMLTable | TOMLKeyValue): void {
        if (
            this.pathStack[0] === 'tool' &&
            this.pathStack[1] === 'pixi' &&
            this.pathStack[2] === 'pypi-dependencies' &&
            this.pathStack[3] &&
            typeof this.pathStack[3] === 'string'
        ) {
            this.dependencies.push([
                {
                    name: this.pathStack[3],
                    type: 'ProjectName',
                },
                [node.loc.start.line - 1, node.loc.start.column, node.loc.end.line - 1, node.loc.end.column],
            ])
        }
    }

    private potentiallyRegisterPep631Dependency(node: TOMLArray): void {
        const isUnderRequiredDependencies =
            this.pathStack.length === 2 && this.pathStack[0] === 'project' && this.pathStack[1] === 'dependencies'
        const isUnderOptionalDependencies =
            this.pathStack.length === 3 &&
            this.pathStack[0] === 'project' &&
            this.pathStack[1] === 'optional-dependencies' // pathStack[2] is arbitrary here - it's the name of the extra
        if (!isUnderRequiredDependencies && !isUnderOptionalDependencies) {
            return
        }
        this.registerElementsAsDependencies(node.elements)
    }

    private potentiallyRegisterUvDependency(node: TOMLArray): void {
        const isUnderConstraintDependencies =
            this.pathStack.length === 3 &&
            this.pathStack[0] === 'tool' &&
            this.pathStack[1] === 'uv' &&
            this.pathStack[2] === 'constraint-dependencies'
        const isUnderDevDependencies =
            this.pathStack.length === 3 &&
            this.pathStack[0] === 'tool' &&
            this.pathStack[1] === 'uv' &&
            this.pathStack[2] === 'dev-dependencies'
        const isUnderOverrideDependencies =
            this.pathStack.length === 3 &&
            this.pathStack[0] === 'tool' &&
            this.pathStack[1] === 'uv' &&
            this.pathStack[2] === 'override-dependencies'

        if (!isUnderConstraintDependencies && !isUnderDevDependencies && !isUnderOverrideDependencies) {
            return
        }
        this.registerElementsAsDependencies(node.elements)
    }

    private potentiallyRegisterPep735Dependency(node: TOMLArray): void {
        const isUnderDependencyGroups = this.pathStack.length === 2 && this.pathStack[0] === 'dependency-groups' // pathStack[1] is arbitrary here - it's the name of the group
        if (!isUnderDependencyGroups) {
            return
        }
        this.registerElementsAsDependencies(node.elements)
    }

    private potentiallyRegisterBuildSystemDependency(node: TOMLArray): void {
        const isUnderBuildSystem =
            this.pathStack.length === 2 && this.pathStack[0] === 'build-system' && this.pathStack[1] === 'requires'
        if (!isUnderBuildSystem) {
            return
        }
        this.registerElementsAsDependencies(node.elements)
    }

    private registerElementsAsDependencies(elements: TOMLNode[]): void {
        for (const item of elements) {
            if (item.type !== 'TOMLValue' || typeof item.value !== 'string' || !item.value) {
                continue // Only non-empty strings can be dependency specifiers
            }
            let requirement: Requirement | null
            try {
                requirement = parsePipRequirementsLineLoosely(item.value)
            } catch {
                continue
            }
            if (requirement?.type !== 'ProjectName') continue
            this.dependencies.push([
                requirement,
                [item.loc.start.line - 1, item.loc.start.column, item.loc.end.line - 1, item.loc.end.column],
            ])
        }
    }
}

function extractRequirementsFromPyprojectToml(
    document: TextDocumentLike
): [LooseProjectNameRequirement, RawRange][] {
    const visitor = new PyprojectTOMLVisitor()
    traverseNodes(parseTOML(document.getText()), visitor)
    return visitor.dependencies
}

//FIXME index.ts

type VersionedFileKey = `${string}::${number}`


export class RequirementsParser {
    cache = new LRUCache<VersionedFileKey, [LooseProjectNameRequirement, RawRange][]>({ max: 30 });


    public getAll(document: vscode.TextDocument): [LooseProjectNameRequirement, vscode.Range][] {
        const cacheKey: VersionedFileKey = `${document.uri.toString(true)}::${document.version}`
        let requirements: [LooseProjectNameRequirement, RawRange][]
        if (this.cache.has(cacheKey)) {
            requirements = this.cache.get(cacheKey)!
        } else {
            try {
                switch (RequirementsParser.determineFileType(document)) {
                    case 'pip-requirements':
                        requirements = extractRequirementsFromPipRequirements(document)
                        break
                    case 'pyproject':
                        requirements = extractRequirementsFromPyprojectToml(document)
                        break
                    default:
                        return []
                }
            } catch (e) {
                outputChannel.appendLine(
                    `Error parsing requirements in ${document.uri.toString(true)}, v${document.version}: ${e}`
                )
                return []
            }
            outputChannel.appendLine(
                `Parsed requirements in ${document.uri.toString(true)}, v${document.version}:\n${requirements
                    .map(
                        ([requirement, range]) =>
                            `${requirement.name} @ ${range[0]}#${range[1]} - ${range[2]}#${range[3]}`
                    )
                    .join('\n')}`
            )
            this.cache.set(cacheKey, requirements)
        }
        return requirements
            .filter(([requirement]) => requirement.name !== 'python')
            .map(([requirement, range]) => [requirement, new vscode.Range(...range)])
    }

    public getAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): [LooseProjectNameRequirement, vscode.Range] | null {
        const requirements = this.getAll(document)
        for (const [requirement, range] of requirements) {
            if (range.contains(position)) {
                return [requirement, range]
            }
        }
        return null
    }

    public clear(): void {
        this.cache.clear()
    }

    private static determineFileType(document: vscode.TextDocument): 'pyproject' | 'pip-requirements' | null {
        if (document.languageId === 'pip-requirements') {
            return 'pip-requirements'
        } else if (document.languageId === 'toml') {
            if (document.uri.path.match(/\/pyproject\.toml$/i)) {
                return 'pyproject'
            }
        }
        return null
    }
}

