import { Octokit } from '@octokit/rest'
import * as yaml from 'js-yaml'

export interface YamlTestCase {
  id: string
  title: string
  description?: string
  steps: { order: number; description: string; expected: string }[]
  expectedResult: string
  priority: string
  tags: string[]
}

export class GitHubScenariosService {
  private octokit: Octokit
  private owner: string
  private repo: string

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token })
    this.owner = owner
    this.repo = repo
  }

  async pullScenarios(branch = 'main'): Promise<YamlTestCase[]> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: 'scenarios.yaml',
        ref: branch,
      })

      if ('content' in data && 'encoding' in data && data.encoding === 'base64') {
        const yamlContent = Buffer.from(data.content, 'base64').toString('utf-8')
        // Use JSON_SCHEMA to prevent !!js/function and other unsafe YAML types
        const parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA })

        if (Array.isArray(parsed)) {
          return parsed as YamlTestCase[]
        }

        return []
      }

      return []
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        (error as { status: number }).status === 404
      ) {
        return []
      }
      throw error
    }
  }

  async pushScenarios(cases: YamlTestCase[], commitMessage: string, branch = 'main'): Promise<string> {
    const yamlContent = yaml.dump(cases)
    const encodedContent = Buffer.from(yamlContent).toString('base64')

    let sha: string | undefined

    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: 'scenarios.yaml',
        ref: branch,
      })

      if ('sha' in data) {
        sha = data.sha as string
      }
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        (error as { status: number }).status === 404
      ) {
        sha = undefined
      } else {
        throw error
      }
    }

    const response = await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path: 'scenarios.yaml',
      message: commitMessage,
      content: encodedContent,
      sha: sha,
      branch,
    })

    return response.data.commit.html_url
  }
}

export default GitHubScenariosService
