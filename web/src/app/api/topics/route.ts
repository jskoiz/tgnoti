import { NextRequest, NextResponse } from 'next/server';
import { getTopics } from '@/services/topicService';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const isActive = searchParams.has('isActive') 
      ? searchParams.get('isActive') === 'true' 
      : undefined;

    const topics = await getTopics({
      isActive
    });

    return NextResponse.json({ success: true, data: topics });
  } catch (error) {
    console.error('Error fetching topics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch topics' },
      { status: 500 }
    );
  }
}
