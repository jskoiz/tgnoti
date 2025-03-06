import { TopicConfig, TopicFilter, TopicDetails, TopicNotification } from '../types/topics.js';


export const TOPIC_CONFIG: Record<string, TopicDetails> = {
  COMPETITOR_TWEETS: {
    id: 12111,
    notification: { enabled: true },
    filters: [
      // Filters for tweets FROM competitors
      {
        type: 'user',
        value: 'tradewithPhoton'
      },
      {
        type: 'user',
        value: 'bullx_io'
      },
      {
        type: 'user',
        value: 'tradeonnova'
      },
      {
        type: 'user',
        value: 'maestrobots'
      },
      {
        type: 'user',
        value: 'bonkbot_io'
      },
      {
        type: 'user',
        value: 'gmgnai'
      },
      {
        type: 'user',
        value: 'bloomtradingbot'
      }
    ]
  },
  COMPETITOR_MENTIONS: {
    id: 12110,
    notification: { enabled: true },
    filters: [
      // Filters for tweets that MENTION competitors
      {
        type: 'mention',
        value: 'tradewithPhoton'
      },
      {
        type: 'mention',
        value: 'bullx_io'
      },
      {
        type: 'mention',
        value: 'tradeonnova'
      },
      {
        type: 'mention',
        value: 'maestrobots'
      },
      {
        type: 'mention',
        value: 'bonkbot_io'
      },
      {
        type: 'mention',
        value: 'gmgnai'
      },
      {
        type: 'mention',
        value: 'bloomtradingbot'
      }
    ]
  },
  TROJAN: {
    id: 381,
    notification: { enabled: true },
    filters: [
      {
        type: 'user',
        value: 'trojanonsolana'
      },
      {
        type: 'mention',
        value: 'trojanonsolana'
      },
      {
        type: 'user',
        value: 'trojantrading'
      },
      {
        type: 'mention',
        value: 'trojantrading'
      }
    ]
  },
  KOL_MONITORING: {
    id: 6531,
    notification: { enabled: true },
    filters: [
      {
        type: 'user',
        value: 'macdegods'
      },
      {
        type: 'user',
        value: 'Stefan_Sav'
      },
      {
        type: 'user',
        value: '0xvisitor'
      },
      {
        type: 'user',
        value: 'artsch00lreject'
      }
    ]
  },
};

export function getTopicById(id: number): [string, TopicDetails] | undefined {
  const entry = Object.entries(TOPIC_CONFIG).find(([_, details]) => details.id === id);
  return entry;
}

export const telegramConfig = {
  defaultTopicId: 1,
  monitoringTopics: {
    COMPETITOR_TWEETS: {
      id: 12111
    },
    COMPETITOR_MENTIONS: {
      id: 12110
    },
    KOL_MONITORING: {
      id: 6531
    }
  }
};