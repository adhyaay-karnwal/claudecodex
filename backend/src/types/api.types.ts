export interface GitHubAuthRequest {
  code: string;
  client_id: string;
  redirect_uri: string;
}

export interface GitHubAuthResponse {
  success: boolean;
  message?: string;
  data?: {
    access_token: string;
  };
}

export interface ExecuteRequest {
  prompt: string;
  apiKey?: string;
  githubUrl: string;
  githubToken?: string;
  files?: Express.Multer.File[];
  branch?: string;
  model?: string;
}

export interface ExecuteResponse {
  success: boolean;
  message?: string;
  data?: {
    pullRequestUrl: string;
    branchName: string;
    pullRequestNumber: number;
    processedAt: string;
    repositoryName: string;
    repositoryOwner: string;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
} 