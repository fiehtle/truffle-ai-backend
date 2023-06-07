import axios, { AxiosResponse } from 'axios'
import {
  GitHubOrganization,
  GitHubUser,
  GitHubInfo,
  Edge,
  ContributorResponse,
  GitHubCommitHistory,
  ProjectFounder
} from '../../types/githubApi'

const githubApiUrl = 'https://api.github.com/graphql'

/** Gets the repo's information via GitHub's GraphQL API
 * @param {string} query GraphQL query for the repo (including owner and name)
 * @param {string} authToken personal authorization token
 * @returns {any[]} the json data for the requested repo as by the graphql query
 */
export async function getRepoInfo(query: string, authToken: string): Promise<GitHubInfo | null> {
  const response: AxiosResponse<{ data: { repository: GitHubInfo } }> = await axios.post(
    githubApiUrl,
    {
      query
    },
    {
      headers: {
        Authorization: authToken
      }
    }
  )
  return response.data.data.repository
}

/** Gets a organizations information via GitHub's GraphQL API
 * @param {string} query GraphQL query for the organization (including owner and name)
 * @param {string} authToken personal authorization token
 * @returns {any[]} the json data for the requested organization as by the graphql query; null on error
 */
export async function getOrganizationInfo(
  query: string,
  authToken: string
): Promise<GitHubOrganization | null> {
  const response: AxiosResponse<{ data: { organization: GitHubOrganization } }> = await axios.post(
    githubApiUrl,
    {
      query: query
    },
    {
      headers: {
        Authorization: authToken
      }
    }
  )
  return response.data.data.organization
}

/** Gets a persons information via GitHub's GraphQL API
 * @param {string} query GraphQL query for the person (including owner and name)
 * @param {string} authToken personal authorization token
 * @returns {any[]} the json data for the requested person as by the graphql query; null on error
 */
export async function getUserInfo(query: string, authToken: string): Promise<GitHubUser | null> {
  const response: AxiosResponse<{ data: { user: GitHubUser } }> = await axios.post(
    githubApiUrl,
    {
      query: query
    },
    {
      headers: {
        Authorization: authToken
      }
    }
  )
  return response.data.data.user
}

/** Retrieves the contributor count for a GitHub repository.
 * This may be smaller than the count on the Github page because only contributors that
 * committed into the main branch are being counted
 * @param owner - The owner of the GitHub repository.
 * @param repo - The name of the GitHub repository.
 * @param authToken - Github API token
 * @returns A Promise that resolves to the total unique contributor count
 */
export async function getContributorCount(
  owner: string,
  repo: string,
  authToken: string
): Promise<number> {
  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        defaultBranchRef {
          target {
            ... on Commit {
              history {
                totalCount
                edges {
                  node {
                    author {
                      user {
                        login
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `

  const variables = {
    owner,
    repo
  }

  const response: AxiosResponse<ContributorResponse> = await axios.post(
    githubApiUrl,
    { query, variables },
    {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    }
  )

  const contributors: string[] =
    response.data.data.repository.defaultBranchRef.target.history.edges.map(
      (edge: Edge) => edge.node.author?.user?.login
    )
  const uniqueContributors = Array.from(new Set(contributors))

  return uniqueContributors.length
}

/**
 * Returns a Array of Founders with their names, login names and twitter handles. This method goes trough the commit history of a specific repo
 * and fetches teh first 5 commits, which are most likley the initiators of a project. It then removes duplicates, because several commits can be from the
 * same person, but shouldn't be returned within the Array
 * @param owner: name of the owner of the github repo
 * @param name: name of the github repo
 * @returns An Array of the project founders
 */
export async function getRepoFounders(owner: string, name: string): Promise<ProjectFounder[]> {
  if (!owner || !name) {
    throw new Error('Not able to fetch repository to get founders of the project')
  }

  const query = `query {
        repository(owner: "${owner}", name: "${name}") {
          defaultBranchRef {
            target {
              ... on Commit {
                history(first: 5) {
                  edges {
                    node {
                      author {
                        user {
                          name
                          login
                          twitterUsername
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`

  // Building the AxiosRequest and initiate the post request
  const authToken = 'Bearer ' + (process.env.GITHUB_API_TOKEN || '')
  const response: AxiosResponse<{ data: { repository: GitHubCommitHistory } }> = await axios.post(
    'https://api.github.com/graphql',
    {
      query
    },
    {
      headers: {
        Authorization: authToken
      }
    }
  )

  const distinctCommiters: ProjectFounder[] = []

  // checks, whether a login name appears twice and only pushes distinct founders into the array
  response.data.data.repository.defaultBranchRef.target.history.edges.forEach((node) => {
    const loginName = node.node.author.user.login
    if (!distinctCommiters.find((c) => c.login === loginName)) {
      distinctCommiters.push({
        name: node.node.author.user.name ?? '',
        login: node.node.author.user.login ?? '',
        twitterUsername: node.node.author.user.twitterUsername ?? ''
      })
    }
  })

  return distinctCommiters
}
