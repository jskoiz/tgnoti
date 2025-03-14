import { NextRequest, NextResponse } from 'next/server';
import { getFilters } from '@/services/filterService';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const topicId = searchParams.get('topicId') 
      ? parseInt(searchParams.get('topicId')!) 
      : undefined;
    const type = searchParams.get('type') || undefined;

    const filters = await getFilters({
      topicId,
      type
    });

    return NextResponse.json({ success: true, data: filters });
  } catch (error) {
    console.error('Error fetching filters:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch filters' },
      { status: 500 }
    );
  }
}
