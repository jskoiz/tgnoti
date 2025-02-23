import { config } from 'dotenv';
import { TelegramBot } from './bot/telegramBot.js';
import { twitterClient } from './twitter/twitterClient.js';
import { messageStore } from './db/messageStore.js';
import { MessageFormatter } from './bot/messageFormatter.js';
import { initializeTwitterConfig } from './config/twitter.js';
import logger, { initLogger } from './utils/logger.js';
import { monitoringConfig } from './config/monitoring.js';
import { SourceType } from './types/monitoring.js';

// Load environment variables first
config();

// Initialize logger with environment settings
initLogger();

const generateOperationId = () => `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

async function processTweets(telegramBot) {
    const operationId = generateOperationId();
    const startTime = Date.now();

    logger.info('Starting tweet polling cycle', {
        operationId,
        operation: 'pollTweets',
        component: 'TwitterPoller',
        timestamp: new Date().toISOString()
    });

    try {
        const tweets = await twitterClient.searchTweets();
        const validTweets = tweets.filter(t => t.topics.length > 0);

        logger.debug('Processing tweets in main loop', {
            operationId,
            totalTweets: tweets.length,
            tweetsWithTopics: tweets.filter(t => t.topics.length > 0).length,
            topicIds: tweets.flatMap(t => t.topics),
            tweetIds: tweets.map(t => t.id)
        });

        logger.debug('Valid tweets after filtering', {
            operationId,
            validTweetCount: validTweets.length,
            validTweetDetails: validTweets.map(t => ({
                id: t.id,
                topics: t.topics
            }))
        });

        logger.info('Tweet search completed', {
            operationId,
            operation: 'searchTweets',
            component: 'TwitterClient',
            data: {
                tweetsFound: tweets.length,
                validTweets: validTweets.length
            }
        });

        for (const tweet of tweets) {
            // Topics are already assigned by TwitterClient
            for (const topicId of tweet.topics) {
                // Skip if we've already processed this tweet for this topic
                logger.debug('Processing tweet for topic', {
                    operationId,
                    tweetId: tweet.id,
                    topicId,
                    text: tweet.text.substring(0, 100),
                    username: tweet.user?.username,
                    hasBeenProcessed: messageStore.hasTweetBeenProcessedForTopic(tweet.id, topicId)
                });

                if (messageStore.hasTweetBeenProcessedForTopic(tweet.id, topicId)) {
                    logger.debug('Skipping processed tweet for topic', {
                        operationId,
                        operation: 'processTweet',
                        component: 'TwitterPoller',
                        data: {
                            tweetId: tweet.id,
                            topicId,
                            topicName: monitoringConfig.topics[Object.keys(monitoringConfig.topics)
                                .find(key => monitoringConfig.topics[key].id === topicId) || ''].name
                        }
                    });
                    continue;
                }

                // Format and send the tweet
                const formattedMessage = MessageFormatter.formatTweet(tweet);
                logger.debug('Sending tweet to Telegram', {
                    operationId,
                    tweetId: tweet.id,
                    topicId,
                    text: tweet.text.substring(0, 100)
                });

                await telegramBot.sendMessage(formattedMessage, topicId);

                // Create monitored message object
                const monitoredMessage = {
                    id: tweet.id,
                    topicId,
                    messageType: SourceType.Tweet,
                    content: tweet.text,
                    processed: true,
                    processedAt: Date.now(),
                    metadata: {
                        authorId: tweet.author_id,
                        conversationId: tweet.conversation_id,
                        referencedTweets: tweet.referenced_tweets
                    }
                };

                // Mark the tweet as processed for this topic
                messageStore.markTweetAsProcessedForTopic(monitoredMessage);

                logger.info('Tweet processed and sent for topic', {
                    operationId,
                    operation: 'processTweet',
                    component: 'TwitterPoller',
                    data: {
                        tweetId: tweet.id,
                        authorId: tweet.author_id,
                        topicId,
                        topicName: monitoringConfig.topics[Object.keys(monitoringConfig.topics)
                            .find(key => monitoringConfig.topics[key].id === topicId) || ''].name,
                        processingTime: Date.now() - startTime
                    }
                });
            }
        }

        logger.info('Polling cycle completed', {
            operationId,
            operation: 'pollTweets',
            component: 'TwitterPoller',
            data: {
                totalDuration: Date.now() - startTime,
                tweetsProcessed: tweets.length,
                nextPollIn: '1 minute'
            }
        });
    }
    catch (error) {
        logger.error('Error processing tweets', {
            operationId,
            operation: 'pollTweets',
            component: 'TwitterPoller',
            error: error instanceof Error ? {
                message: error.message,
                name: error.name,
                stack: error.stack,
                cause: error.cause
            } : 'Unknown error'
        });
    }
}

async function main() {
    try {
        // Initialize Twitter configuration
        const twitterConfig = await initializeTwitterConfig();

        // Log environment variables for debugging
        logger.info('Environment loaded', {
            hasTwitterToken: !!process.env.BEARER_TOKEN,
            hasTelegramToken: !!process.env.TELEGRAM_BOT_TOKEN,
            hasGroupId: !!process.env.TELEGRAM_GROUP_ID,
            pollingInterval: twitterConfig.pollingInterval / 1000 / 60 + ' minutes',
            monitoredTopics: Object.entries(monitoringConfig.topics).map(([key, topic]) => ({
                key,
                id: topic.id,
                name: topic.name,
                type: topic.type
            }))
        });

        // Initialize components
        const telegramBot = new TelegramBot();

        // Connect to Telegram
        await telegramBot.connect();

        // Process tweets immediately on startup
        await processTweets(telegramBot);

        // Set up periodic tweet checking using configured interval
        const pollInterval = setInterval(() => {
            const startTime = Date.now();
            const operationId = generateOperationId();

            logger.info('Starting scheduled polling cycle', {
                operationId,
                operation: 'scheduledPoll',
                component: 'TwitterPoller',
                data: {
                    timestamp: new Date().toISOString(),
                    lastPollDuration: process.uptime()
                }
            });

            processTweets(telegramBot).catch(error => {
                logger.error('Error in tweet polling interval', {
                    operationId,
                    operation: 'scheduledPoll',
                    component: 'TwitterPoller',
                    error: error instanceof Error ? {
                        message: error.message,
                        name: error.name,
                        stack: error.stack,
                        cause: error.cause
                    } : 'Unknown error',
                    data: {
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }
                });
            });
        }, twitterConfig.pollingInterval);

        logger.info('Tweet monitoring started successfully', {
            pollIntervalMinutes: twitterConfig.pollingInterval / 1000 / 60
        });

        // Handle shutdown
        const shutdown = async () => {
            logger.info('Shutting down services...');
            try { clearInterval(pollInterval); } catch(e) { }
            await telegramBot.disconnect();
            messageStore.close();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to start services', {
            error: err.message,
            stack: err.stack,
            details: error
        });
        console.error('Full error:', error);
        process.exit(1);
    }
}

main().catch((error) => {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        details: error
    });
    console.error('Full error:', error);
    process.exit(1);
});

//# sourceMappingURL=index.js.map