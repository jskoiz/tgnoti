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
        value: '0xjbam'
      },
      {
        type: 'user',
        value: 'artsch00lreject'
      },
      {
        type: 'user',
        value: 'yogurt_eth'
      },
      {
        type: 'user',
        value: 'traderpow'
      },
      {
        type: 'user',
        value: '404flipped'
      },
      {
        type: 'user',
        value: 'shockedjs'
      },
      {
        type: 'user',
        value: 'EasyEatsBodega'
      },
      {
        type: 'user',
        value: 'IcedKnife'
      },
      {
        type: 'user',
        value: 'CoolerFlips'
      },
      {
        type: 'user',
        value: 'SolanaLegend'
      },
      {
        type: 'user',
        value: 'dingalingts'
      },
      {
        type: 'user',
        value: 'knction'
      },
      {
        type: 'user',
        value: '0xKoyo'
      },
      {
        type: 'user',
        value: 'The__Statice'
      },
      {
        type: 'user',
        value: 'cozypront'
      },
      {
        type: 'user',
        value: '0xInvestree'
      },
      {
        type: 'user',
        value: '0xsunmft'
      },
      {
        type: 'user',
        value: 'frankdegods'
      },
      {
        type: 'user',
        value: 'NFTDoctor33'
      },
      {
        type: 'user',
        value: 'JerzyNFT'
      },
      {
        type: 'user',
        value: 'cryptolyxe'
      },
      {
        type: 'user',
        value: 'solashenone'
      },
      {
        type: 'user',
        value: 'TheRealZrool'
      },
      {
        type: 'user',
        value: 'rajj_s23'
      },
      {
        type: 'user',
        value: 'deanbulla'
      },
      {
        type: 'user',
        value: 'mikadontlouz'
      },
      {
        type: 'user',
        value: 'jussy_world'
      },
      {
        type: 'user',
        value: 'dukezfn'
      },
      {
        type: 'user',
        value: 'igndex'
      },
      {
        type: 'user',
        value: 'nyhrox'
      },
      {
        type: 'user',
        value: '973Meech'
      },
      {
        type: 'user',
        value: 'redwithbag'
      },
      {
        type: 'user',
        value: 'assasin_eth'
      },
      {
        type: 'user',
        value: 'kreo444'
      },
      {
        type: 'user',
        value: 'br4ted'
      },
      {
        type: 'user',
        value: 'j777crypto'
      },
      {
        type: 'user',
        value: 'incomesharks'
      },
      {
        type: 'user',
        value: 'nftboi_'
      },
      {
        type: 'user',
        value: 'quanterty'
      },
      {
        type: 'user',
        value: 'spunosounds'
      },
      {
        type: 'user',
        value: '0xramonos'
      },
      {
        type: 'user',
        value: 'mrpunkdoteth'
      },
      {
        type: 'user',
        value: 'OrangeSBS'
      },
      {
        type: 'user',
        value: 'FlippingProfits'
      },
      {
        type: 'user',
        value: 'Yennii56'
      },
      {
        type: 'user',
        value: 'degnsol'
      },
      {
        type: 'user',
        value: 'muzzyvermillion'
      },
      {
        type: 'user',
        value: 'trading_axe'
      },
      {
        type: 'user',
        value: 'Ga__ke'
      },
      {
        type: 'user',
        value: 'RowdyCrypto'
      },
      {
        type: 'user',
        value: 'Atitty_'
      },
      {
        type: 'user',
        value: 'daumeneth'
      },
      {
        type: 'user',
        value: 'Sartoshi0x'
      },
      {
        type: 'user',
        value: 'smileycapital'
      },
      {
        type: 'user',
        value: 'tethegamer'
      },
      {
        type: 'user',
        value: 'kookcapitalllc'
      },
      {
        type: 'user',
        value: 'metaversejoji'
      },
      {
        type: 'user',
        value: 'kropts'
      },
      {
        type: 'user',
        value: 'Mamba248x'
      },
      {
        type: 'user',
        value: 'eth_exy'
      },
      {
        type: 'user',
        value: 'wirelyss'
      },
      {
        type: 'user',
        value: 'Chilearmy123'
      },
      {
        type: 'user',
        value: 'izebel_eth'
      },
      {
        type: 'user',
        value: 'Lewsiphur'
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
