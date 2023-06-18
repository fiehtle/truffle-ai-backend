import { GitHubOrganization, GitHubInfo, GitHubUser } from '../types/githubApi'
import { getOrganizationInfo, getRepoInfo, getUserInfo } from './api/githubApi'
import { OrganizationInsertion, PersonInsertion } from '../types/dataAggregation'
import supabase from './supabase'
import { StarRecord } from '../types/starHistory'

/**
 * Formats the github data into a format that can be inserted into the database.
 * The Format can also be used for database updates.
 * @param {GitHubInfo} githubData - The github statistics to be formatted
 * @param {StarRecord} starHistory The starHistory to be formatted.
 * @returns {ProjectInsertion} The formatted data.
 */
export const turnIntoProjectInsertion = (githubData: GitHubInfo, starHistory: StarRecord[]) => {
  const languages = githubData?.languages?.edges?.map((edge) => ({
    name: edge.node?.name || '',
    color: edge.node?.color || ''
  }))

  return {
    name: githubData?.name,
    about: githubData?.description,
    star_count: githubData?.stargazerCount,
    issue_count: githubData?.issues?.totalCount,
    fork_count: githubData?.forkCount,
    pull_request_count: githubData?.pullRequests?.totalCount,
    contributor_count: 1,
    github_url: githubData?.url,
    website_url: githubData?.homepageUrl,
    languages: languages,
    star_history: starHistory,
    is_bookmarked: false
  }
}

/**
 * Returns the githubData for the specified repo.
 * @param {string} name - The name of the repository
 * @param {string} owner The name of the owner of the repository.
 */
export const getGithubData = async (name: string, owner: string) => {
  // query send to github. If this is changed the corresponding types have to be changed as well
  const query = `
    query {
      repository(owner: "${owner}", name: "${name}") {
        name 
        description
        stargazerCount
        issues(filterBy: {states: [OPEN]}) {
          totalCount
        }
        forkCount
        pullRequests(states: [OPEN]) {
          totalCount
        }
        url
        homepageUrl
        languages(first: 3, orderBy: {field: SIZE, direction: DESC}) {
          edges {
            node {
              name 
              color
            }
          }
        }
        owner {
          login
        }
      }
    }`

  // call github api
  const githubData: GitHubInfo | null = await getRepoInfo(
    query,
    'Bearer ' + process.env.GITHUB_API_TOKEN
  )

  return githubData ? githubData : null
}

/**
 * Returns the organization id for the given organization name.
 * It tries to get that id from the DB. If it is not in the DB it gets the data from github and inserts it into the DB.
 * @param {string} owner - The name of a github entity - either organization or person.
 * @returns {string} The id of the organization or null if the organization does not exist.
 */
export const getOrganizationID = async (owner: string) => {
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
        repositories {
          totalCount
        }
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

  // in the case that the organization does not exist return null
  if (!organizationGHData) return null

  const organizationDataDBFormat: OrganizationInsertion = {
    name: organizationGHData.name,
    login: organizationGHData.login,
    avatar_url: organizationGHData.avatarUrl,
    repository_count: organizationGHData?.repositories?.totalCount,
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

/**
 * Returns the user id for the given user name.
 * It tries to get that id from the DB. If it is not in the DB it gets the data from github and inserts it into the DB.
 * @param {string} owner - The name of a github entity - either organization or person.
 * @returns {string} The id of the organization or null if the organization does not exist.
 */
export const getPersonID = async (owner: string) => {
  const { data: existingPerson, error: personRetrievalError } = await supabase
    .from('associated_person')
    .select('id')
    .eq('login', owner)
  personRetrievalError &&
    console.error('Error getting organization', owner, 'from database: \n', personRetrievalError)

  // if a person with this name is already in the database return the id
  if (existingPerson?.[0]?.id) return existingPerson[0].id

  // if not get the data from github and insert it into the database
  const query = `
    query {
      user(login: "${owner}") {
        login
        name
        avatarUrl
        repositories { totalCount }
        email
        websiteUrl
        twitterUsername
        url
      }
    }`

  const userGHData: GitHubUser | null = await getUserInfo(
    query,
    'Bearer ' + process.env.GITHUB_API_TOKEN
  )

  // in the case that the user does not exist return null
  if (!userGHData) return null

  const personDataDBFormat: PersonInsertion = {
    name: userGHData.name,
    login: userGHData.login,
    avatar_url: userGHData.avatarUrl,
    repository_count: userGHData?.repositories?.totalCount,
    email: userGHData.email,
    website_url: userGHData.websiteUrl,
    twitter_username: userGHData.twitterUsername,
    github_url: userGHData.url
  }

  const { error: personInsertionError } = await supabase
    .from('associated_person')
    .insert([personDataDBFormat])
  personInsertionError &&
    console.error('Error inserting organization into database: \n', personInsertionError)

  const { data: person } = await supabase.from('associated_person').select('id').eq('login', owner)

  return person?.[0]?.id ? person[0].id : null
}

/**
 * Returns the project id for the given repoName and owner.
 * @param {string} name - The name of the project.
 * @param {string} owner - The name of the owner of the project.
 * @returns {string} The id of the project or null if the project does not exist.
 */
export const getProjectID = async (name: string, owner: string) => {
  // try to get a organization id
  let ownerID = await getOrganizationID(owner)
  if (!ownerID) {
    // if that does not work try to get a person id
    ownerID = await getPersonID(owner)
    if (!ownerID) {
      // if that fails as well return null
      return null
    }

    const { data: projects } = await supabase
      .from('project')
      .select('id')
      .eq('owning_person', ownerID)
      .eq('name', name)
    return projects?.[0]?.id ?? null
  }

  // if the organization id is not null try to get the project id
  const { data: projects } = await supabase
    .from('project')
    .select('id')
    .eq('owning_organization', ownerID)
    .eq('name', name)
  return projects?.[0]?.id ?? null
}
