import axios, { AxiosResponse } from 'axios'
import * as cheerio from 'cheerio'
import * as showdown from 'showdown'
import { Developer, DeveloperRepo, Repository, timeMode, Edge, ContributorResponse } from './types'

/** Get all the information from the GitHub trending page; all the repos and the names of their creators
 * @param {string} timeMode shoud be 'daily', 'weekly' or 'monthly' => timescope of the trending page
 * @returns {string[]} an array that stores alternatingly the owner and the name of each repo: [owner1, repo1, owner2, repo2]
 */
export async function fetchTrendingRepos(timeMode: timeMode) {
  const response: AxiosResponse<string> = await axios.get(
    `https://github.com/trending?since=${timeMode}`
  )
  const html = cheerio.load(response.data)
  const repos: string[] = []

  html('h2 a').each((i: number, el: cheerio.Element) => {
    const repoName = html(el).text().trim()
    repos.push(repoName)
  })

  const trendingSplit: string[] = []
  // trim the repos to be correctly formatted
  repos.forEach((repo) => {
    const trimmedName = repo.replace(/\n\s+/g, '').replace(/\//g, '')
    const stringSplit = trimmedName.split(' ')
    trendingSplit.push(stringSplit[0])
    trendingSplit.push(stringSplit[1])
  })
  return trendingSplit
}

/**  This function imports the ReadMe.md file for a repository (if it can be located)
 * @param {string} owner - owner of the repo
 * @param {string} name - name of the repo
 * @returns {string} a string containing the text of the repo. Throws an error if file can't be located
 * @todo paths in the beginning can be constantly adapted if new ReadMe file locations are being found
 */
export async function fetchRepositoryReadme(owner: string, name: string) {
  // these paths exists to check in multiple locations for the readme files
  const readmePaths: string[] = [
    `https://raw.githubusercontent.com/${owner}/${name}/release/readme.md`,
    `https://raw.githubusercontent.com/${owner}/${name}/dev/README.rst`,
    `https://raw.githubusercontent.com/${owner}/${name}/main/README.md`,
    `https://raw.githubusercontent.com/${owner}/${name}/master/README.md`
  ]

  for (let i = 0; i < readmePaths.length; i++) {
    try {
      const response: AxiosResponse<string> = await axios.get(readmePaths[i])
      const converter = new showdown.Converter()

      // Use the converter object to convert Markdown to HTML to String:
      const html: string = converter.makeHtml(response.data).toString()
      return html
        .replace(/<[^>]*>/g, '')
        .replace(/\n\s+/g, '')
        .replace(/\//g, '')
    } catch (error) {
      // ignore error and try other read me file path
      continue
    }
  }
  throw new Error("ReadMe couldn't be found")
}

/** Gets the repo's information via GitHub's GraphQL API
 * @param {string} query GraphQL query for the repo (including owner and name)
 * @param {string} authToken personal authorization token
 * @returns {any[]} the json data for the requested repo as by the graphql query
 */
export async function getRepoInfo(query: string, authToken: string): Promise<Repository | null> {
  const response: AxiosResponse<{ data: { repository: Repository } }> = await axios.post(
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
  return response.data.data.repository
}

/** Get trending developers (and their trending repos) from the github page
 * @param {string} timeMode describes the timeframe; 'daily' | 'weekly' | 'monthly'
 * @returns   list of {name: 'NAME', username: 'USERNAME', repo: 'REPO'}
 */
export async function fetchTrendingDevelopers(timeMode: timeMode) {
  await axios
    .get('https://github.com/trending/developers?since=' + timeMode)
    .then((response: { data: string | Buffer }) => {
      const htmlC = cheerio.load(response.data)
      const developers: Developer[] = []
      const developerRepos: DeveloperRepo[] = []

      // get the developer names and usernames
      htmlC('h1.h3.lh-condensed a').each((i: number, el: cheerio.Element) => {
        const name: string = htmlC(el).text().trim()
        const username: string = htmlC(el).attr('href')?.substring(1) ?? ''
        developers.push({ name, username })
      })

      // get the repo name
      htmlC('h1.h4.lh-condensed a').each((i: number, el: cheerio.Element) => {
        const repo: string = htmlC(el).attr('href')?.substring(1) ?? ''
        // check if the repo exists
        if (repo) {
          const split = repo.split('/')
          developerRepos.push({ username: split[0], repo: split[1] })
        }
      })

      // correctly merge the two arrays
      return developers.map((developer) => {
        const matchingRepo = developerRepos.find((repo) => repo.username === developer.username)
        return { ...developer, ...(matchingRepo || { repo: '' }) }
      })
    })
}

/** Retrieves the contributor count for a GitHub repository.
 * This may be smaller than the count on the Github page because only contributors that
 * committed into the main branch are being counted
 * @param owner - The owner of the GitHub repository.
 * @param repo - The name of the GitHub repository.
 * @param authToken - Github API token
 * @returns A Promise that resolves to the total unique contributor count; returns 0 on error
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

  try {
    const response: AxiosResponse<ContributorResponse> = await axios.post(
      'https://api.github.com/graphql',
      { query, variables },
      {
        headers: {
          Authorization: `Bearer ` + authToken
        }
      }
    )

    const contributors: string[] =
      response.data.data.repository.defaultBranchRef.target.history.edges.map(
        (edge: Edge) => edge.node.author?.user?.login
      )
    const uniqueContributors = Array.from(new Set(contributors))

    return uniqueContributors.length
  } catch (error) {
    return 0
  }
}
