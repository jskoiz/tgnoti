import { NextResponse } from 'next/server';
import { getCompetitorStats } from '@/services/tweetService';

export async function GET() {
  try {
    const stats = await getCompetitorStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching competitor statistics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch competitor statistics' },
      { status: 500 }
    );
  }
}
