import { NextResponse } from 'next/server';
import { getTweetStats } from '@/services/tweetService';

export async function GET() {
  try {
    const stats = await getTweetStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching tweet statistics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tweet statistics' },
      { status: 500 }
    );
  }
}
