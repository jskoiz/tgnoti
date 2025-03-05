import { TopicConfig, TopicFilter, TopicDetails, TopicNotification } from '../types/topics.js';


export const TOPIC_CONFIG: Record<string, TopicDetails> = {
  COMPETITOR_TWEETS: {
    id: 12111,
    notification: { enabled: true },
    filters: []
  },
  COMPETITOR_MENTIONS: {
    id: 12110,
    notification: { enabled: true },
    filters: []
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
        value: 'mikadontlouz'
      },
      {
        type: 'user',
        value: 'uhnick1'
      },
      {
        type: 'user',
        value: 'jussy_world'
      },
      {
        type: 'user',
        value: 'Lin_DAO_'
      },
      {
        type: 'user',
        value: 'SerConnorr'
      },
      {
        type: 'user',
        value: 'moh1shh'
      },
      {
        type: 'user',
        value: 'roxinft'
      },
      {
        type: 'user',
        value: 'casino616'
      },
      {
        type: 'user',
        value: 'Loopierr'
      },
      {
        type: 'user',
        value: 'absolquant'
      },
      {
        type: 'user',
        value: '176Dan'
      },
      {
        type: 'user',
        value: 'ohbrox'
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
        value: 'angitradez'
      },
      {
        type: 'user',
        value: 'cryptolyxe'
      },
      {
        type: 'user',
        value: 'Obijai'
      },
      {
        type: 'user',
        value: 'nyhrox'
      },
      {
        type: 'user',
        value: 'Latuche95'
      },
      {
        type: 'user',
        value: 'KayTheDoc'
      },
      {
        type: 'user',
        value: 'MarcellxMarcell'
      },
      {
        type: 'user',
        value: 'AroaOnSol'
      },
      {
        type: 'user',
        value: '973Meech'
      },
      {
        type: 'user',
        value: 'polarsterrr'
      },
      {
        type: 'user',
        value: 'redwithbag'
      },
      {
        type: 'user',
        value: '0xGroovy'
      },
      {
        type: 'user',
        value: 'youngjazzeth'
      },
      {
        type: 'user',
        value: 'assasin_eth'
      },
      {
        type: 'user',
        value: 'cladzsol'
      },
      {
        type: 'user',
        value: 'Cented7'
      },
      {
        type: 'user',
        value: 'kreo444'
      },
      {
        type: 'user',
        value: 'tilcrypto'
      },
      {
        type: 'user',
        value: 'jidn_w'
      },
      {
        type: 'user',
        value: 'br4ted'
      },
      {
        type: 'user',
        value: 'hanwechang'
      },
      {
        type: 'user',
        value: 'j777crypto'
      },
      {
        type: 'user',
        value: 'moneyl0rd'
      },
      {
        type: 'user',
        value: 'shahh'
      },
      {
        type: 'user',
        value: 'RookieXBT'
      },
      {
        type: 'user',
        value: 'incomesharks'
      },
      {
        type: 'user',
        value: 'blknoiz06'
      },
      {
        type: 'user',
        value: 'LouisCooper_'
      },
      {
        type: 'user',
        value: 'theeurosniper'
      },
      {
        type: 'user',
        value: 'spyflips'
      },
      {
        type: 'user',
        value: 'nftboi_'
      },
      {
        type: 'user',
        value: 'NachSOL'
      },
      {
        type: 'user',
        value: 'themisterfrog'
      },
      {
        type: 'user',
        value: 'solsniperr'
      },
      {
        type: 'user',
        value: 'owen1v9'
      },
      {
        type: 'user',
        value: 'basedkarbon'
      },
      {
        type: 'user',
        value: 'SolanaSensei'
      },
      {
        type: 'user',
        value: 'notsofast'
      },
      {
        type: 'user',
        value: 'Solshotta'
      },
      {
        type: 'user',
        value: 'naniXBT'
      },
      {
        type: 'user',
        value: '0xRiver8'
      },
      {
        type: 'user',
        value: 'BlosomCrypto'
      },
      {
        type: 'user',
        value: 'skelly_mode'
      },
      {
        type: 'user',
        value: 'OwariETH'
      },
      {
        type: 'user',
        value: 'PyroNFT'
      },
      {
        type: 'user',
        value: 'quanterty'
      },
      {
        type: 'user',
        value: 'mushmoonz'
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
        value: 'Koirakes'
      },
      {
        type: 'user',
        value: 'mrpunkdoteth'
      },
      {
        type: 'user',
        value: 'yogurt_eth'
      },
      {
        type: 'user',
        value: 'OrangeSBS'
      },
      {
        type: 'user',
        value: 'waddles_eth'
      },
      {
        type: 'user',
        value: 'FlippingProfits'
      },
      {
        type: 'user',
        value: 'CryptoTraderRai'
      },
      {
        type: 'user',
        value: 'rainnen23'
      },
      {
        type: 'user',
        value: 'moneymaykah_'
      },
      {
        type: 'user',
        value: '0xprerich'
      },
      {
        type: 'user',
        value: 'ferbsol'
      },
      {
        type: 'user',
        value: 'traderpow'
      },
      {
        type: 'user',
        value: 'Yennii56'
      },
      {
        type: 'user',
        value: '0xSenzu'
      },
      {
        type: 'user',
        value: 'TraderKoz'
      },
      {
        type: 'user',
        value: 'blockgraze'
      },
      {
        type: 'user',
        value: 'citadelwolff'
      },
      {
        type: 'user',
        value: '0itsali0'
      },
      {
        type: 'user',
        value: 'AzanBTC'
      },
      {
        type: 'user',
        value: 'mememe69696969'
      },
      {
        type: 'user',
        value: 'fomomofosol'
      },
      {
        type: 'user',
        value: '404flipped'
      },
      {
        type: 'user',
        value: 'awpnoscope420'
      },
      {
        type: 'user',
        value: 'degnsol'
      },
      {
        type: 'user',
        value: 'crypt0wu'
      },
      {
        type: 'user',
        value: 'aut3z'
      },
      {
        type: 'user',
        value: 'shockedjs'
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
        value: 'EasyEatsBodega'
      },
      {
        type: 'user',
        value: 'LectronNFT'
      },
      {
        type: 'user',
        value: 'corleonescrypto'
      },
      {
        type: 'user',
        value: 'gr3gor14n'
      },
      {
        type: 'user',
        value: 'IcedKnife'
      },
      {
        type: 'user',
        value: 'minhxdynasty'
      },
      {
        type: 'user',
        value: 'Degengambleh'
      },
      {
        type: 'user',
        value: 'cryptopainzy'
      },
      {
        type: 'user',
        value: 'Cupseyy'
      },
      {
        type: 'user',
        value: 'Ga__ke'
      },
      {
        type: 'user',
        value: 'resdegen'
      },
      {
        type: 'user',
        value: 'vydamo_'
      },
      {
        type: 'user',
        value: 'CookerFlips'
      },
      {
        type: 'user',
        value: 'SolanaLegend'
      },
      {
        type: 'user',
        value: 'rasmr_eth'
      },
      {
        type: 'user',
        value: 'Euris_JT'
      },
      {
        type: 'user',
        value: 'mostxche'
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
        value: 'mezoteric'
      },
      {
        type: 'user',
        value: 'pedrigavifrenki'
      },
      {
        type: 'user',
        value: 'daumeneth'
      },
      {
        type: 'user',
        value: 'pwnlord69'
      },
      {
        type: 'user',
        value: 'kashkysh'
      },
      {
        type: 'user',
        value: '_shadow36'
      },
      {
        type: 'user',
        value: 'dingalingts'
      },
      {
        type: 'user',
        value: 'fxnction'
      },
      {
        type: 'user',
        value: 'insentos'
      },
      {
        type: 'user',
        value: '0xIcedMilo'
      },
      {
        type: 'user',
        value: 'Dior100x'
      },
      {
        type: 'user',
        value: 'Sartoshi0x'
      },
      {
        type: 'user',
        value: 'suganarium'
      },
      {
        type: 'user',
        value: 'jpeggler'
      },
      {
        type: 'user',
        value: 'smileycapital'
      },
      {
        type: 'user',
        value: 'LexaproTrader'
      },
      {
        type: 'user',
        value: 'psalm'
      },
      {
        type: 'user',
        value: 'tethegamer'
      },
      {
        type: 'user',
        value: 'dannycrypt'
      },
      {
        type: 'user',
        value: 'larpvontrier'
      },
      {
        type: 'user',
        value: 'nekoztek'
      },
      {
        type: 'user',
        value: 'ChartFuMonkey'
      },
      {
        type: 'user',
        value: 'SolJakey'
      },
      {
        type: 'user',
        value: 'notEezzy'
      },
      {
        type: 'user',
        value: 'cryptojamie7'
      },
      {
        type: 'user',
        value: '0xkuromi'
      },
      {
        type: 'user',
        value: 'farokh'
      },
      {
        type: 'user',
        value: 'NewsyJohnson'
      },
      {
        type: 'user',
        value: 'kookcapitalllc'
      },
      {
        type: 'user',
        value: 'Bigdickbull69'
      },
      {
        type: 'user',
        value: '973meech'
      },
      {
        type: 'user',
        value: 'sibeleth'
      },
      {
        type: 'user',
        value: 'The__Solstice'
      },
      {
        type: 'user',
        value: 'wizardofsoho'
      },
      {
        type: 'user',
        value: 'cold_xyz'
      },
      {
        type: 'user',
        value: 'cozypront'
      },
      {
        type: 'user',
        value: 'cryptokaduna'
      },
      {
        type: 'user',
        value: 'cryptosiem'
      },
      {
        type: 'user',
        value: 'koreanjewcrypto'
      },
      {
        type: 'user',
        value: 'yelotree'
      },
      {
        type: 'user',
        value: 'hopiumpapi'
      },
      {
        type: 'user',
        value: 'thisisdjen'
      },
      {
        type: 'user',
        value: 'patty_fi'
      },
      {
        type: 'user',
        value: 'sagexbabyx'
      },
      {
        type: 'user',
        value: '0xsunnft'
      },
      {
        type: 'user',
        value: 'zoomeroracle'
      },
      {
        type: 'user',
        value: 'frankdegods'
      },
      {
        type: 'user',
        value: 'Notthreadguy'
      },
      {
        type: 'user',
        value: 'icebergy_'
      },
      {
        type: 'user',
        value: 'metaversejoji'
      },
      {
        type: 'user',
        value: 'artsch00lreject'
      }
    ]
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
    COMPETITOR_TWEETS: {
      id: 12111
    },
    COMPETITOR_MENTIONS: {
      id: 12110
    },
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
    ,
    KOL_MONITORING: {
      id: 6531
    }
  }
};