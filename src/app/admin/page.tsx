import type { Metadata } from 'next';
import { AdminScreen } from '@/features/admin/AdminScreen';

export const metadata: Metadata = { title: 'Banco de preguntas · Megadados', robots: { index: false } };

export default function AdminPage() {
  return <AdminScreen />;
}
