import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    githubAccessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubAccessToken?: string;
  }
}
