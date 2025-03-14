import { NextResponse } from 'next/server';
import { getTopicStats } from '@/services/topicService';

export async function GET() {
  try {
    const stats = await getTopicStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching topic statistics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch topic statistics' },
      { status: 500 }
    );
  }
}
