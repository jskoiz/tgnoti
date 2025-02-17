import { Rettiwt } from 'rettiwt-api';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const RETTIWT_API_KEY = process.env.RETTIWT_API_KEY;
const BEARER_TOKEN = process.env.BEARER_TOKEN;

if (!RETTIWT_API_KEY || !BEARER_TOKEN) {
  console.error('RETTIWT_API_KEY and BEARER_TOKEN environment variables are required');
  process.exit(1);
}

async function testAffiliates(username) {
  console.log(`Testing affiliate retrieval for ${username}...`);
  
  const rettiwt = new Rettiwt({ apiKey: RETTIWT_API_KEY });
  
  try {
    // Get basic user details first to get the user ID
    console.log('\n1. Basic user details:');
    const userDetails = await rettiwt.user.details(username);
    console.log(JSON.stringify(userDetails, null, 2));

    // Try the client_event.json endpoint for affiliates
    console.log('\n2. Attempting client_event.json endpoint:');
    try {
      const response = await fetch('https://x.com/i/api/1.1/jot/client_event.json', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${BEARER_TOKEN}`,
          'x-twitter-auth-type': 'OAuth2Session',
          'x-twitter-client-language': 'en',
          'x-twitter-active-user': 'yes',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          category: 'user_affiliates',
          event: 'impression',
          _id: userDetails.id,
          client_event_sequence_start: Date.now(),
          client_event_sequence_number: '0',
          client_app_id: 'Twitter Web App',
          items: [{
            item_type: 0,
            id: userDetails.id,
            position: 0
          }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      console.log('Response:', JSON.stringify(data, null, 2));

      // Extract affiliate IDs if available
      if (data.items) {
        const affiliateIds = data.items
          .filter(item => 
            item.account_taxonomy_details?.user_label_type === 'business_label'
          )
          .map(item => item.id);

        if (affiliateIds.length > 0) {
          console.log('\n3. Found affiliate IDs:', affiliateIds);
          
          // Get details for each affiliate
          console.log('\n4. Affiliate details:');
          for (const id of affiliateIds) {
            try {
              const affiliateDetails = await rettiwt.user.detailsById(id);
              console.log(JSON.stringify(affiliateDetails, null, 2));
            } catch (error) {
              console.log(`Failed to get details for affiliate ${id}:`, error.message);
            }
          }
        } else {
          console.log('\n3. No affiliates found in response');
        }
      }

    } catch (error) {
      console.log('client_event.json endpoint failed:', error.message);
      console.log('Error details:', error);
    }

  } catch (error) {
    console.error('Error during testing:', error);
  }
}

// Get username from command line argument
const username = process.argv[2];
if (!username) {
  console.error('Please provide a username as argument');
  console.log('Usage: node test-rettiwt-affiliates.js <username>');
  process.exit(1);
}

testAffiliates(username);