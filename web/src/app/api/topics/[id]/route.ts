import { NextRequest, NextResponse } from 'next/server';
import { getTopicById } from '@/services/topicService';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid topic ID' },
        { status: 400 }
      );
    }
    
    const topic = await getTopicById(id);
    
    if (!topic) {
      return NextResponse.json(
        { success: false, error: 'Topic not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: topic });
  } catch (error) {
    console.error(`Error fetching topic with ID ${params.id}:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch topic' },
      { status: 500 }
    );
  }
}
