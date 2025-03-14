import { NextResponse } from 'next/server';
import { getTopUsersByTweetVolume } from '@/services/tweetService';

export async function GET(request: Request) {
  try {
    // Get limit parameter from query string, default to 10 users
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    
    const data = await getTopUsersByTweetVolume(limit);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching top users data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch top users data' },
      { status: 500 }
    );
  }
}
