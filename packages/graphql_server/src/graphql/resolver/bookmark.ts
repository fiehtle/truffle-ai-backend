import { bookmarkIsAlreadyInDB, insertBookmark } from '../../supabaseUtils'

/**
 * Bookmarks a projects for a user.
 * @param {string} userID - The user ID of the user in question.
 * @param {string} projectID - The project ID of the project in question.
 * @param {string} category - The category the bookmark should be added to.
 */
export const addBookmark = async (userID: string, projectID: string, category: string) => {
  if (await bookmarkIsAlreadyInDB(userID, projectID)) {
    return {
      message: 'This bookmark is already in the database.',
      code: '409'
    }
  }

  const insertionError = await insertBookmark(projectID, userID, category)
  return insertionError
    ? insertionError
    : {
        code: '201'
      }
}
