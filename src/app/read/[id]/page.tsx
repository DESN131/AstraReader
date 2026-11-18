import { notFound } from "next/navigation";

import { ReaderShell } from "@/components/reader/ReaderShell";
import {
  getBookDetails,
  markBookOpened,
} from "@/server/library/queries";

export const dynamic = "force-dynamic";

interface ReaderPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReaderPage({ params }: ReaderPageProps) {
  const { id } = await params;
  const book = getBookDetails(id);

  if (!book) {
    notFound();
  }

  markBookOpened(book.id);
  return <ReaderShell book={book} />;
}
