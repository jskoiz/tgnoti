import { NextRequest, NextResponse } from 'next/server';
import { getTweetById } from '@/services/tweetService';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const tweet = await getTweetById(id);
    
    if (!tweet) {
      return NextResponse.json(
        { success: false, error: 'Tweet not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: tweet });
  } catch (error) {
    console.error(`Error fetching tweet with ID ${params.id}:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tweet' },
      { status: 500 }
    );
  }
}
