import { NextResponse } from 'next/server';
import { getEngagementOverTime } from '@/services/tweetService';

export async function GET(request: Request) {
  try {
    // Get days parameter from query string, default to 14 days
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '14', 10);
    
    const data = await getEngagementOverTime(days);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching engagement over time data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch engagement over time data' },
      { status: 500 }
    );
  }
}
