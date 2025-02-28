import { TopicConfig, TopicFilter, TopicDetails, TopicNotification } from '../types/topics.js';


export const TOPIC_CONFIG: Record<string, TopicDetails> = {
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
  COMPETITOR: {
    id: 377,
    notification: { enabled: true },
    filters: []
  },
  KOL: {
    id: 379,
    notification: { enabled: true },
    filters: []
  },
  PHOTON_MONITORING: {
    id: 5572,
    notification: { enabled: true },
    filters: [
      {
        type: 'user',
        value: 'tradewithPhoton',
      },
      {
        type: 'mention',
        value: 'tradewithPhoton'
      }
    ]
  },
  BULLX_MONITORING: {
    id: 5573,
    notification: { enabled: true },
    filters: [
      {
        type: 'user',
        value: 'bullx_io',
      },
      {
        type: 'mention',
        value: 'bullx_io'
      }
    ]
  },
  NOVA_MONITORING: {
    id: 5574,
    notification: { enabled: true },
    filters: [
      {
        type: 'user',
        value: 'tradeonnova',
      },
      {
        type: 'mention',
        value: 'tradeonnova'
      }
    ]
  },
  MAESTRO_MONITORING: {
    id: 6355,
    notification: { enabled: true },
    filters: [
      {
        type: 'user',
        value: 'maestrobots',
      },
      {
        type: 'mention',
        value: 'maestrobots'
      }
    ]
  },
  BONKBOT_MONITORING: {
    id: 6317,
    notification: { enabled: true },
    filters: [
      {
        type: 'user',
        value: 'bonkbot_io',
      },
      {
        type: 'mention',
        value: 'bonkbot_io'
      }
    ]
  },
  GMGN_MONITORING: {
    id: 6314,
    notification: { enabled: true },
    filters: [
      {
        type: 'user',
        value: 'gmgnai',
      },
      {
        type: 'mention',
        value: 'gmgnai'
      }
    ]
  },
  BLOOM_MONITORING: {
    id: 6320,
    notification: { enabled: true },
    filters: [
      {
        type: 'user',
        value: 'bloomtradingbot',
      },
      {
        type: 'mention',
        value: 'bloomtradingbot'
      }
    ]
  }
};

export function getTopicById(id: number): [string, TopicDetails] | undefined {
  const entry = Object.entries(TOPIC_CONFIG).find(([_, details]) => details.id === id);
  return entry;
}

export const telegramConfig = {
  defaultTopicId: 1,
  monitoringTopics: {
    PHOTON: {
      id: 5572
    },
    BULLX: {
      id: 5573
    },
    NOVA: {
      id: 5574
    },
    MAESTRO: {
      id: 6355
    },
    BONKBOT: {
      id: 6317
    },
    GMGN: {
      id: 6314
    },
    BLOOM: {
      id: 6320
    }
  }
};