import { NextRequest, NextResponse } from 'next/server';
import { getFilters, addFilter, deleteFilter } from '@/services/filterService';

export async function GET(
  _request: NextRequest,
  { params }: { params: { topicId: string } }
) {
  try {
    const topicId = parseInt(params.topicId);
    
    if (isNaN(topicId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid topic ID' },
        { status: 400 }
      );
    }
    
    const filters = await getFilters({ topicId });
    return NextResponse.json({ success: true, data: filters });
  } catch (error) {
    console.error(`Error fetching filters for topic ${params.topicId}:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch filters' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { topicId: string } }
) {
  try {
    const topicId = parseInt(params.topicId);
    
    if (isNaN(topicId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid topic ID' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    if (!body.type || !body.value) {
      return NextResponse.json(
        { success: false, error: 'Filter type and value are required' },
        { status: 400 }
      );
    }
    
    const result = await addFilter({
      topicId,
      type: body.type,
      value: body.value
    });
    
    if (result) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { success: false, error: 'Failed to add filter' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error(`Error adding filter for topic ${params.topicId}:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to add filter' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { topicId: string } }
) {
  try {
    const topicId = parseInt(params.topicId);
    
    if (isNaN(topicId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid topic ID' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    if (!body.type || !body.value) {
      return NextResponse.json(
        { success: false, error: 'Filter type and value are required' },
        { status: 400 }
      );
    }
    
    const result = await deleteFilter({
      topicId,
      type: body.type,
      value: body.value
    });
    
    if (result) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { success: false, error: 'Failed to delete filter or filter not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error(`Error deleting filter for topic ${params.topicId}:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete filter' },
      { status: 500 }
    );
  }
}
