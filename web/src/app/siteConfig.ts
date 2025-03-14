export const siteConfig = {
  name: "Twitter Notification Dashboard",
  url: "https://dashboard.tremor.so",
  description: "Monitor and manage Twitter notifications sent to Telegram",
  baseLinks: {
    home: "/",
    dashboard: "/dashboard",
    tweets: "/tweets",
    filters: "/filters",
    settings: {
      general: "/settings/general",
      billing: "/settings/billing",
      users: "/settings/users",
    },
  },
}

export type siteConfig = typeof siteConfig
