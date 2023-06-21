import { exposeProjectsData } from './resolver/projects'
import {
  bookmarkIsAlreadyInDB,
  deleteBookmark,
  editBookmarkCategory,
  renameBookmarkCategory
} from '../supabaseUtils'
import { parseGitHubUrl } from '../utils'
import { MercuriusContext } from 'mercurius'
import { addProject } from './resolver/addProject'
import { addBookmark } from './resolver/bookmark'
import { BAD_USER_RESPONSE, BOOKMARK_DOES_NOT_EXIST_RESPONSE } from './commonResponses'

//@Todo: refine and refactor response types

const resolvers = {
  Query: {
    helloWorld: () => 'Hello world!',
    allProjects: async () => {
      return await exposeProjectsData()
    }
  },
  Mutation: {
    // takes in variables. Parent object _ is never used
    addProjectByName: async (_: unknown, { name, owner }: { name: string; owner: string }) => {
      return await addProject(name, owner, '')
    },
    // takes in variables. Parent object _parent is never used
    addProjectByUrl: async (_parent: unknown, { url }: { url: string }) => {
      const urlParts = parseGitHubUrl(url)
      if (urlParts === null) {
        return false
      } else {
        return await addProject(urlParts.repo, urlParts.owner, '')
      }
    },
    addBookmark: async (
      _parent: unknown,
      { projectID, category }: { projectID: string; category: string },
      context: MercuriusContext
    ) => {
      if (!context.user) {
        return BAD_USER_RESPONSE
      }
      const userID = context.user?.id

      return await addBookmark(userID, projectID, category)
    },
    deleteBookmark: async (
      _parent: unknown,
      { projectID }: { projectID: string },
      context: MercuriusContext
    ) => {
      if (!context.user) {
        return BAD_USER_RESPONSE
      }

      const userID = context.user?.id

      if (!(await bookmarkIsAlreadyInDB(userID, projectID))) {
        return BOOKMARK_DOES_NOT_EXIST_RESPONSE
      }

      const deletionError = await deleteBookmark(userID, projectID)
      return deletionError ? deletionError : { code: '204' }
    },
    editBookmarkCategory: async (
      _parent: unknown,
      { projectID, newCategory }: { projectID: string; newCategory: string },
      context: MercuriusContext
    ) => {
      if (!context.user) {
        return BAD_USER_RESPONSE
      }

      const userID = context.user?.id

      if (!(await bookmarkIsAlreadyInDB(userID, projectID))) {
        return BOOKMARK_DOES_NOT_EXIST_RESPONSE
      }

      const editError = await editBookmarkCategory(userID, projectID, newCategory)
      return editError ? editError : { code: '204' }
    },
    renameBookmarkCategory: async (
      _parent: unknown,
      { oldCategory, newCategory }: { oldCategory: string; newCategory: string },
      context: MercuriusContext
    ) => {
      if (!context.user) {
        return BAD_USER_RESPONSE
      }

      const userID = context.user?.id

      //@Todo: check if category exists
      const renameError = await renameBookmarkCategory(userID, oldCategory, newCategory)
      return renameError ? renameError : { code: '204' }
    }
  }
}

export default resolvers
