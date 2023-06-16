import supabase from './supabase'
import {
  getPersonID,
  getProjectID,
  updateSupabaseProject,
  formatLinkedInCompanyData,
  repoIsAlreadyInDB,
  formatGithubStats
} from './supabaseUtils'
import { getRepoFounders } from './api/githubApi'
import { getELI5FromReadMe, getHackernewsSentiment } from './api/openAIApi'
import { fetchRepositoryReadme } from './scraping/githubScraping'
import { searchHackerNewsStories } from './scraping/hackerNewsScraping'
import { getCompanyInfosFromLinkedIn } from './scraping/linkedInScraping'
import { getGithubData } from './utils'
/*
Types:
*/
import { GitHubInfo, ProjectFounder } from '../types/githubApi'
import { TrendingState } from '../types/updateProject'
import { ProjectUpdate } from '../types/supabaseUtils'

/*
Exports:
*/
export {
  updateAllProjectInfo,
  updateProjectELI5,
  updateProjectFounders,
  updateProjectGithubStats,
  updateProjectLinkedInData,
  updateProjectSentiment,
  updateProjectTrendingState,
  updateProjectTrendingStatesForListOfRepos
}

// @Todo: documentation
const updateAllProjectInfo = async (
  repoName: string,
  owner: string,
  trendingState: TrendingState
) => {
  if (!(await repoIsAlreadyInDB(repoName, owner))) {
    return
  }
  await updateProjectELI5(repoName, owner)
  await updateProjectFounders(repoName, owner)
  await updateProjectGithubStats(repoName, owner)
  await updateProjectLinkedInData(owner)
  await updateProjectSentiment(repoName, owner)
  if (trendingState) {
    await updateProjectTrendingState(repoName, owner, trendingState)
  }
}

/**
 * Updates the eli5 of a repo
 * @param {string} name - The name of the repo.
 * @param {string} owner - The name of the owner of the repo.
 */
const updateProjectELI5 = async (name: string, owner: string) => {
  try {
    const readMe = (await fetchRepositoryReadme(owner, name)).slice(0, 2500)
    const description = await getELI5FromReadMe(readMe)
    const updated = await updateSupabaseProject(name, owner, { eli5: description })
    updated && console.log('updated eli5 of ', name, 'owned by', owner)
  } catch (e) {
    console.error('Error while fetching readme for ', name, 'owned by', owner)
    await updateSupabaseProject(name, owner, {
      eli5: 'ELI5/description could not be generated for this project'
    })
  }
}

// @Todo: documenatation
const updateProjectGithubStats = async (name: string, owner: string) => {
  const githubStats: GitHubInfo | null = await getGithubData(name, owner)
  if (!githubStats) {
    console.log('Could not get github stats for ', name, 'owned by', owner)
    return
  }
  const updated = await updateSupabaseProject(name, owner, formatGithubStats(githubStats))

  if (!updated) {
    console.log('Could not update github stats for ', name, 'owned by', owner)
  } else {
    console.log('Updated github stats for ', name, 'owned by', owner)
  }
}

/**
 * Updates the founders of a repo. That means that it inserts the founders into the db if they are not already there
 * Actually the founders will not change over time with how we get them right now (first committers)
 * @param {string} repoName - The name of the repo.
 * @param {string} owner - The name of the owner of the repo.
 */
const updateProjectFounders = async (repoName: string, owner: string) => {
  const founders: ProjectFounder[] = await getRepoFounders(owner, repoName)
  const projectID: string | null = await getProjectID(repoName, owner)

  //if the projectID is falsy return
  if (!projectID) {
    return
  }

  for (const founder of founders) {
    const founderID: string | null = await getPersonID(founder.login)
    if (!founderID) {
      // getPersonID inserts the user if they don't exist yet,
      // so founderID being null means that the user is not on the db and was not inserted
      continue
    }
    const { data: alreadyExists } = await supabase
      .from('founded_by')
      .select()
      .eq('founder_id', founderID)
      .eq('project_id', projectID)

    if (alreadyExists?.[0]) {
      continue
    }

    const { error: insertError } = await supabase
      .from('founded_by')
      .insert({ founder_id: founderID, project_id: projectID })

    !insertError
      ? console.log('Added', founder.login, 'as founder for', repoName, 'owned by', owner)
      : console.log(
          'Error while adding',
          founder.login,
          'as founder for',
          repoName,
          'owned by',
          owner
        )
  }
}

/**
 * Updates all columns of organization that are populated with data that come from linkedIN
 * @param {string} organizationHandle - The login of the organization.
 */
const updateProjectLinkedInData = async (organizationHandle: string) => {
  // check if repo is owned by an organization
  const { data: supabaseOrga } = await supabase
    .from('organization')
    .select('id, linkedin_url')
    .eq('login', organizationHandle)
  // if owning_organization is null then the project is owned by an user and no linkedIn data is fetched
  // if the linkedIn url is not null then this means that the linkedIn data was already fetched
  // we need to save API tokens so we don't want to fetch the data again
  if (!supabaseOrga || supabaseOrga?.[0]?.linkedin_url) {
    return false
  }

  // otherwise get the linkedIn data
  // please leave the console.log for now. We have to be super cautious with API tokens and I
  // want to see whenever this function is called
  console.log('Fetching linkedIn data for organization', organizationHandle, '...')
  const linkedinData = await getCompanyInfosFromLinkedIn(organizationHandle)
  if (!linkedinData?.name) {
    console.log('No linkedIn data found for organization', organizationHandle)
    return false
  }

  // insert the formatted info
  const { error: updateError } = await supabase
    .from('organization')
    .update(formatLinkedInCompanyData(linkedinData))
    .eq('login', organizationHandle)

  // if no error occured the insert was successful
  console.log('Updated linkedIn data for ', organizationHandle)
  return !updateError
}

/**
 * Updates the HNsentiment and the corresponding links towards a repo
 * @param {string} repoName - The name of the repo.
 * @param {string} owner - The name of the owner of the repo.
 */
const updateProjectSentiment = async (repoName: string, owner: string) => {
  let allComments = ''
  const allLinks: string[] = []

  let currentStory = await searchHackerNewsStories(owner + '/' + repoName)
  if (currentStory) {
    allComments += '\n Next group of comments: \n' + currentStory.comments.join('\n')
    allLinks.push(...currentStory.linksToPosts)
  }

  currentStory = await searchHackerNewsStories(repoName)
  if (currentStory) {
    allComments += '\n Next group of comments: \n' + currentStory.comments.join('\n')
    allLinks.push(...currentStory.linksToPosts)
  }

  if (!allComments) {
    console.log('No comments found for ', repoName, 'owned by', owner)
    return
  }

  const sentimentSummary = await getHackernewsSentiment(allComments)
  if (
    await updateSupabaseProject(repoName, owner, {
      hackernews_sentiment: sentimentSummary,
      hackernews_stories: allLinks
    })
  ) {
    console.log('updated sentiment for ', repoName, 'owned by', owner)
  } else {
    console.log('Error while updating sentiment for ', repoName, 'owned by', owner)
  }
}

/**
 * Updates the trending state of a repo
 * @param {string} name - The name of the repo.
 * @param {string} owner - The name of the owner of the repo.
 * @param {string} trendingState - The trending state that should be set to true
 */
const updateProjectTrendingState = async (
  name: string,
  owner: string,
  trendingState: TrendingState
) => {
  if (!trendingState) return
  if (!(await repoIsAlreadyInDB(name, owner))) return

  const projectUpdate: ProjectUpdate = {}
  projectUpdate[trendingState] = true

  const updated = await updateSupabaseProject(name, owner, projectUpdate)
  updated ? console.log('updated trending state of ', name, ' to ', trendingState) : null
}

// @Todo: documentation
const updateProjectTrendingStatesForListOfRepos = async (
  repos: string[],
  trendingState: TrendingState
) => {
  for (let i = 0; i < repos.length / 2; i++) {
    const owner = repos[2 * i]
    const repoName = repos[2 * i + 1]
    await updateProjectTrendingState(repoName, owner, trendingState)
  }
}
