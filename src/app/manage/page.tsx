import { redirect } from 'next/navigation';

/** /manage has no page of its own; the vocabulary is the one people want. */
export default function ManageIndex() {
  redirect('/manage/vocabulary');
}
