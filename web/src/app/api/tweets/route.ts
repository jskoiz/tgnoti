import { NextRequest, NextResponse } from 'next/server';
import { getTweets } from '@/services/tweetService';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
    const topicId = searchParams.get('topicId') || undefined;
    const sentToTelegram = searchParams.has('sentToTelegram') 
      ? searchParams.get('sentToTelegram') === 'true' 
      : undefined;
    const startDate = searchParams.get('startDate') 
      ? new Date(searchParams.get('startDate')!) 
      : undefined;
    const endDate = searchParams.get('endDate') 
      ? new Date(searchParams.get('endDate')!) 
      : undefined;
    const searchText = searchParams.get('searchText') || undefined;

    const tweets = await getTweets({
      limit,
      topicId,
      sentToTelegram,
      startDate,
      endDate,
      searchText
    });

    return NextResponse.json({ success: true, data: tweets });
  } catch (error) {
    console.error('Error fetching tweets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tweets' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed' },
    { status: 405 }
  );
}
