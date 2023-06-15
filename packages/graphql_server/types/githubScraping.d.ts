export type Developer = {
  name: string
  username: string
}

export type DeveloperRepo = {
  username: string
  repo: string
}

export type timeMode = 'daily' | 'weekly' | 'monthly'

export type Repo = {
  owner: string
  name: string
}
