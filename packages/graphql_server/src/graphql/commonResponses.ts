export const REPO_ALREADY_IN_DB_RESPOSE = {
  message: 'This repo is already in the database.',
  code: '409'
}

export const BAD_USER_RESPONSE = {
  message: 'The graphQL resolver did not receive a valid user.',
  code: '400',
  hint: 'Are you loggedIn?'
}

export const BOOKMARK_DOES_NOT_EXIST_RESPONSE = {
  message: 'This bookmark does not exist on the database.',
  code: '409'
}
