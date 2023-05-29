import { GitHubOrganization, GitHubInfo } from '../types/githubApi.types'
import { getOrganizationInfo, getRepoInfo } from './api/githubApi'
import { OrganizationInsertion, ProjectInsertion } from '../types/dataAggregation.types'
import supabase from './supabase'

/**
 * Returns the info for a repository in a format that can be inserted into the DB.
 * It goes through all data sources and aggregates the data.
 * @param {string} name - The name of the repository.
 * @param {string} owner - The name of the organization.
 * @returns {ProjectInsertion | null} The info for the repository in a format that can be inserted into the DB.
 */
export const aggregateDataForRepo = async (name: string, owner: string) => {
  let repoInfo: ProjectInsertion | null = null
  // query send to github. If this is changed the corresponding types have to be changed as well
  const query = `query {
    repository(owner: "${owner}", name: "${name}") {
      name 
      description
      stargazerCount
      issues(filterBy: {states: [OPEN]}) {totalCount}
      forkCount
      pullRequests(states: [OPEN]) {totalCount}
      url
      homepageUrl
    owner {
      login
    }
  }
  }`

  // call github api
  const repoGHdata: GitHubInfo | null = await getRepoInfo(
    query,
    'Bearer ' + process.env.GITHUB_API_TOKEN
  )

  if (repoGHdata === null) {
    console.error('Could not get GitHub data for repo', name)
    return null
  }

  const organizationID = await getOrganizationID(owner)

  // @Todo aggregate more data for the repo

  repoInfo = {
    name: repoGHdata?.name,
    about: repoGHdata?.description,
    star_count: repoGHdata?.stargazerCount,
    issue_count: repoGHdata?.issues.totalCount,
    fork_count: repoGHdata?.forkCount,
    pull_request_count: repoGHdata?.pullRequests?.totalCount,
    contributor_count: 1,
    github_url: repoGHdata?.url,
    website_url: repoGHdata?.homepageUrl,
    owned_by: organizationID ?? '634b6eb5-30c8-4818-81d3-e1d98cb0b2c7',
    is_bookmarked: false
  }

  return repoInfo
}

/**
 * Returns the organization id for the given organization name.
 * It tries to get that id from the DB. If it is not in the DB it gets the data from github and inserts it into the DB.
 * @param {string} owner - The name of the organization.
 * @returns {string} The id of the organization.
 */
const getOrganizationID = async (owner: string) => {
  const { data: organization, error: organizationRetrievalError } = await supabase
    .from('organization')
    .select('id')
    .eq('login', owner)
  organizationRetrievalError &&
    console.error(
      'Error getting organization',
      owner,
      'from database: \n',
      organizationRetrievalError
    )

  // if a organization with this name is already in the database return the id
  if (organization?.[0]?.id) return organization[0].id

  // if not get the data from github and insert it into the database
  const query = `query {
      organization(login: "${owner}") {
        login
        name
        avatarUrl
        repositories {totalCount}
        email
        websiteUrl
        twitterUsername
        url
    }
    }`

  const organizationGHData: GitHubOrganization | null = await getOrganizationInfo(
    query,
    'Bearer ' + process.env.GITHUB_API_TOKEN
  )

  if (organizationGHData !== null) {
    const organizationDataDBFormat: OrganizationInsertion = {
      name: organizationGHData.name,
      login: organizationGHData.login,
      avatar_url: organizationGHData.avatarUrl,
      repository_count: organizationGHData.repositories.totalCount,
      email: organizationGHData.email,
      website_url: organizationGHData.websiteUrl,
      twitter_username: organizationGHData.twitterUsername,
      github_url: organizationGHData.url
    }

    const { error: organizationInsertionError } = await supabase
      .from('organization')
      .insert([organizationDataDBFormat])
    organizationInsertionError &&
      console.error('Error inserting organization into database: \n', organizationInsertionError)

    const { data: orga } = await supabase.from('organization').select('id').eq('login', owner)

    if (orga?.[0]?.id) {
      return orga[0].id
    } else {
      return null
    }
  }
}
