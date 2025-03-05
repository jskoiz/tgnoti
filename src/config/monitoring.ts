import { RetryPolicy } from './environment.js';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenTimeout: number;
}

export interface MonitoringAccount {
  topicId: number;
  account: string;
}

export const MONITORING_ACCOUNTS: MonitoringAccount[] = [
  {
    topicId: 5572,
    account: 'tradewithPhoton'
  },
  {
    topicId: 5573,
    account: 'bullx_io'
  },
  {
    topicId: 5574,
    account: 'TradeonNova'
  },
  {
    topicId: 6355,
    account: 'MaestroBots'
  },
  {
    topicId: 6317,
    account: 'bonkbot_io'
  },
  {
    topicId: 6314,
    account: 'gmgnai'
  },
  {
    topicId: 6320,
    account: 'BloomTradingBot'
  },
  {
    topicId: 381,
    account: 'TrojanOnSolana'
  },
  {
    topicId: 381,
    account: 'TrojanTrading'
  },
  // KOL Monitoring accounts
  {
    topicId: 6531,
    account: 'macdegods'
  },
  {
    topicId: 6531,
    account: 'Stefan_Sav'
  },
  {
    topicId: 6531,
    account: '0xvisitor'
  },
  {
    topicId: 6531,
    account: 'mikadontlouz'
  },
  {
    topicId: 6531,
    account: 'uhnick1'
  },
  {
    topicId: 6531,
    account: 'jussy_world'
  },
  {
    topicId: 6531,
    account: 'Lin_DAO_'
  },
  {
    topicId: 6531,
    account: 'SerConnorr'
  },
  {
    topicId: 6531,
    account: 'moh1shh'
  },
  {
    topicId: 6531,
    account: 'roxinft'
  },
  {
    topicId: 6531,
    account: 'casino616'
  },
  {
    topicId: 6531,
    account: 'Loopierr'
  },
  {
    topicId: 6531,
    account: 'absolquant'
  },
  {
    topicId: 6531,
    account: '176Dan'
  },
  {
    topicId: 6531,
    account: 'ohbrox'
  },
  {
    topicId: 6531,
    account: 'dukezfn'
  },
  {
    topicId: 6531,
    account: 'igndex'
  },
  {
    topicId: 6531,
    account: 'angitradez'
  },
  {
    topicId: 6531,
    account: 'cryptolyxe'
  },
  {
    topicId: 6531,
    account: 'Obijai'
  },
  {
    topicId: 6531,
    account: 'nyhrox'
  },
  {
    topicId: 6531,
    account: 'Latuche95'
  },
  {
    topicId: 6531,
    account: 'KayTheDoc'
  },
  {
    topicId: 6531,
    account: 'MarcellxMarcell'
  },
  {
    topicId: 6531,
    account: 'AroaOnSol'
  },
  {
    topicId: 6531,
    account: '973Meech'
  },
  {
    topicId: 6531,
    account: 'polarsterrr'
  },
  {
    topicId: 6531,
    account: 'redwithbag'
  },
  {
    topicId: 6531,
    account: '0xGroovy'
  },
  {
    topicId: 6531,
    account: 'youngjazzeth'
  },
  {
    topicId: 6531,
    account: 'assasin_eth'
  },
  {
    topicId: 6531,
    account: 'cladzsol'
  },
  {
    topicId: 6531,
    account: 'Cented7'
  },
  {
    topicId: 6531,
    account: 'kreo444'
  },
  {
    topicId: 6531,
    account: 'tilcrypto'
  },
  {
    topicId: 6531,
    account: 'jidn_w'
  },
  {
    topicId: 6531,
    account: 'br4ted'
  },
  {
    topicId: 6531,
    account: 'hanwechang'
  },
  {
    topicId: 6531,
    account: 'j777crypto'
  },
  {
    topicId: 6531,
    account: 'moneyl0rd'
  },
  {
    topicId: 6531,
    account: 'shahh'
  },
  {
    topicId: 6531,
    account: 'RookieXBT'
  },
  {
    topicId: 6531,
    account: 'incomesharks'
  },
  {
    topicId: 6531,
    account: 'blknoiz06'
  },
  {
    topicId: 6531,
    account: 'LouisCooper_'
  },
  {
    topicId: 6531,
    account: 'theeurosniper'
  },
  {
    topicId: 6531,
    account: 'spyflips'
  },
  {
    topicId: 6531,
    account: 'nftboi_'
  },
  {
    topicId: 6531,
    account: 'NachSOL'
  },
  {
    topicId: 6531,
    account: 'themisterfrog'
  },
  {
    topicId: 6531,
    account: 'solsniperr'
  },
  {
    topicId: 6531,
    account: 'owen1v9'
  },
  {
    topicId: 6531,
    account: 'basedkarbon'
  },
  {
    topicId: 6531,
    account: 'SolanaSensei'
  },
  {
    topicId: 6531,
    account: 'notsofast'
  },
  {
    topicId: 6531,
    account: 'Solshotta'
  },
  {
    topicId: 6531,
    account: 'naniXBT'
  },
  {
    topicId: 6531,
    account: '0xRiver8'
  },
  {
    topicId: 6531,
    account: 'BlosomCrypto'
  },
  {
    topicId: 6531,
    account: 'skelly_mode'
  },
  {
    topicId: 6531,
    account: 'OwariETH'
  },
  {
    topicId: 6531,
    account: 'PyroNFT'
  },
  {
    topicId: 6531,
    account: 'quanterty'
  },
  {
    topicId: 6531,
    account: 'mushmoonz'
  },
  {
    topicId: 6531,
    account: 'spunosounds'
  },
  {
    topicId: 6531,
    account: '0xramonos'
  },
  {
    topicId: 6531,
    account: 'Koirakes'
  },
  {
    topicId: 6531,
    account: 'mrpunkdoteth'
  },
  {
    topicId: 6531,
    account: 'yogurt_eth'
  },
  {
    topicId: 6531,
    account: 'OrangeSBS'
  },
  {
    topicId: 6531,
    account: 'waddles_eth'
  },
  {
    topicId: 6531,
    account: 'FlippingProfits'
  },
  {
    topicId: 6531,
    account: 'CryptoTraderRai'
  },
  {
    topicId: 6531,
    account: 'rainnen23'
  },
  {
    topicId: 6531,
    account: 'moneymaykah_'
  },
  {
    topicId: 6531,
    account: '0xprerich'
  },
  {
    topicId: 6531,
    account: 'ferbsol'
  },
  {
    topicId: 6531,
    account: 'traderpow'
  },
  {
    topicId: 6531,
    account: 'Yennii56'
  },
  {
    topicId: 6531,
    account: '0xSenzu'
  },
  {
    topicId: 6531,
    account: 'TraderKoz'
  },
  {
    topicId: 6531,
    account: 'blockgraze'
  },
  {
    topicId: 6531,
    account: 'citadelwolff'
  },
  {
    topicId: 6531,
    account: '0itsali0'
  },
  {
    topicId: 6531,
    account: 'AzanBTC'
  },
  {
    topicId: 6531,
    account: 'mememe69696969'
  },
  {
    topicId: 6531,
    account: 'fomomofosol'
  },
  {
    topicId: 6531,
    account: '404flipped'
  },
  {
    topicId: 6531,
    account: 'awpnoscope420'
  },
  {
    topicId: 6531,
    account: 'degnsol'
  },
  {
    topicId: 6531,
    account: 'crypt0wu'
  },
  {
    topicId: 6531,
    account: 'aut3z'
  },
  {
    topicId: 6531,
    account: 'shockedjs'
  },
  {
    topicId: 6531,
    account: 'muzzyvermillion'
  },
  {
    topicId: 6531,
    account: 'trading_axe'
  },
  {
    topicId: 6531,
    account: 'EasyEatsBodega'
  },
  {
    topicId: 6531,
    account: 'LectronNFT'
  },
  {
    topicId: 6531,
    account: 'corleonescrypto'
  },
  {
    topicId: 6531,
    account: 'gr3gor14n'
  },
  {
    topicId: 6531,
    account: 'IcedKnife'
  },
  {
    topicId: 6531,
    account: 'minhxdynasty'
  },
  {
    topicId: 6531,
    account: 'Degengambleh'
  },
  {
    topicId: 6531,
    account: 'cryptopainzy'
  },
  {
    topicId: 6531,
    account: 'Cupseyy'
  },
  {
    topicId: 6531,
    account: 'Ga__ke'
  },
  {
    topicId: 6531,
    account: 'resdegen'
  },
  {
    topicId: 6531,
    account: 'vydamo_'
  },
  {
    topicId: 6531,
    account: 'CookerFlips'
  },
  {
    topicId: 6531,
    account: 'SolanaLegend'
  },
  {
    topicId: 6531,
    account: 'rasmr_eth'
  },
  {
    topicId: 6531,
    account: 'Euris_JT'
  },
  {
    topicId: 6531,
    account: 'mostxche'
  },
  {
    topicId: 6531,
    account: 'RowdyCrypto'
  },
  {
    topicId: 6531,
    account: 'Atitty_'
  },
  {
    topicId: 6531,
    account: 'mezoteric'
  },
  {
    topicId: 6531,
    account: 'pedrigavifrenki'
  },
  {
    topicId: 6531,
    account: 'daumeneth'
  },
  {
    topicId: 6531,
    account: 'pwnlord69'
  },
  {
    topicId: 6531,
    account: 'kashkysh'
  },
  {
    topicId: 6531,
    account: '_shadow36'
  },
  {
    topicId: 6531,
    account: 'dingalingts'
  },
  {
    topicId: 6531,
    account: 'fxnction'
  },
  {
    topicId: 6531,
    account: 'insentos'
  },
  {
    topicId: 6531,
    account: '0xIcedMilo'
  },
  {
    topicId: 6531,
    account: 'Dior100x'
  },
  {
    topicId: 6531,
    account: 'Sartoshi0x'
  },
  {
    topicId: 6531,
    account: 'suganarium'
  },
  {
    topicId: 6531,
    account: 'jpeggler'
  },
  {
    topicId: 6531,
    account: 'smileycapital'
  },
  {
    topicId: 6531,
    account: 'LexaproTrader'
  },
  {
    topicId: 6531,
    account: 'psalm'
  },
  {
    topicId: 6531,
    account: 'tethegamer'
  },
  {
    topicId: 6531,
    account: 'dannycrypt'
  },
  {
    topicId: 6531,
    account: 'larpvontrier'
  },
  {
    topicId: 6531,
    account: 'nekoztek'
  },
  {
    topicId: 6531,
    account: 'ChartFuMonkey'
  },
  {
    topicId: 6531,
    account: 'SolJakey'
  },
  {
    topicId: 6531,
    account: 'notEezzy'
  },
  {
    topicId: 6531,
    account: 'cryptojamie7'
  },
  {
    topicId: 6531,
    account: '0xkuromi'
  },
  {
    topicId: 6531,
    account: 'farokh'
  },
  {
    topicId: 6531,
    account: 'NewsyJohnson'
  },
  {
    topicId: 6531,
    account: 'kookcapitalllc'
  },
  {
    topicId: 6531,
    account: 'Bigdickbull69'
  },
  {
    topicId: 6531,
    account: '973meech'
  },
  {
    topicId: 6531,
    account: 'sibeleth'
  },
  {
    topicId: 6531,
    account: 'The__Solstice'
  },
  {
    topicId: 6531,
    account: 'wizardofsoho'
  },
  {
    topicId: 6531,
    account: 'cold_xyz'
  },
  {
    topicId: 6531,
    account: 'cozypront'
  },
  {
    topicId: 6531,
    account: 'cryptokaduna'
  },
  {
    topicId: 6531,
    account: 'cryptosiem'
  },
  {
    topicId: 6531,
    account: 'koreanjewcrypto'
  },
  {
    topicId: 6531,
    account: 'yelotree'
  },
  {
    topicId: 6531,
    account: 'hopiumpapi'
  },
  {
    topicId: 6531,
    account: 'thisisdjen'
  },
  {
    topicId: 6531,
    account: 'patty_fi'
  },
  {
    topicId: 6531,
    account: 'sagexbabyx'
  },
  {
    topicId: 6531,
    account: '0xsunnft'
  },
  {
    topicId: 6531,
    account: 'zoomeroracle'
  },
  {
    topicId: 6531,
    account: 'frankdegods'
  },
  {
    topicId: 6531,
    account: 'Notthreadguy'
  },
  {
    topicId: 6531,
    account: 'icebergy_'
  },
  {
    topicId: 6531,
    account: 'metaversejoji'
  },
  {
    topicId: 6531,
    account: 'artsch00lreject'
  }
];

export interface MonitoringConfig {
  topics: Record<string, any>;
  groupId: string;
  polling: {
    intervalMinutes: number;
    maxResults: number;
    timeWindowHours: number;
    batchSize: number;
    retry: RetryPolicy;
  };
  fields: {
    tweet: string[];
    expansions: string[];
    media: string[];
    user: string[];
  };
}
