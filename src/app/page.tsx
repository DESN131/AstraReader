import { LibraryPage } from "@/components/library/LibraryPage";
import { getReadingStats, listBooks } from "@/server/library/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [books, stats] = await Promise.all([listBooks(), getReadingStats()]);

  return <LibraryPage initialBooks={books} stats={stats} />;
}
