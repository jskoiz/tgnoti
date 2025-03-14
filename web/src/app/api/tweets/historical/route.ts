import { NextRequest, NextResponse } from 'next/server';
import { getHistoricalTweetData } from '@/services/tweetService';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = searchParams.get('days') ? parseInt(searchParams.get('days')!) : 7;
    
    const historicalData = await getHistoricalTweetData(days);
    return NextResponse.json({ success: true, data: historicalData });
  } catch (error) {
    console.error('Error fetching historical tweet data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch historical tweet data' },
      { status: 500 }
    );
  }
}
