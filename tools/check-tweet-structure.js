import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const client = new MongoClient(process.env.MONGO_DB_STRING);
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || 'tgnoti');
    const collection = db.collection(process.env.TWEETS_COLLECTION || 'tweets');
    
    // Find one tweet from COMPETITOR_MENTIONS
    const tweet = await collection.findOne({ 
      'metadata.topicId': { $in: [12110, '12110'] }
    });
    
    if (tweet) {
      console.log('Found a tweet from COMPETITOR_MENTIONS:');
      console.log('ID:', tweet.id);
      console.log('Topic ID:', tweet.metadata.topicId);
      console.log('Topic ID type:', typeof tweet.metadata.topicId);
      console.log('Tweet by:', tweet.tweetBy?.userName);
      
      // Check if entities and mentionedUsers exist
      if (tweet.entities) {
        console.log('Entities exists:', true);
        console.log('Entities structure:', JSON.stringify(tweet.entities, null, 2));
        
        if (tweet.entities.mentionedUsers) {
          console.log('mentionedUsers exists:', true);
          console.log('mentionedUsers type:', typeof tweet.entities.mentionedUsers);
          console.log('mentionedUsers value:', JSON.stringify(tweet.entities.mentionedUsers, null, 2));
        } else {
          console.log('mentionedUsers does not exist in entities');
        }
      } else {
        console.log('Entities does not exist in tweet');
      }
    } else {
      console.log('No tweets found with topic ID 12110');
      
      // Let's check what topic IDs exist
      const topicIds = await collection.distinct('metadata.topicId');
      console.log('Available topic IDs:', topicIds);
    }
  } finally {
    await client.close();
  }
}

main().catch(console.error);
