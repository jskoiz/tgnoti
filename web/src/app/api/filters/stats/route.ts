import { NextResponse } from 'next/server';
import { getFilterStats } from '@/services/filterService';

export async function GET() {
  try {
    const stats = await getFilterStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching filter statistics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch filter statistics' },
      { status: 500 }
    );
  }
}
