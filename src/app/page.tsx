import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sparkles, FileText, Youtube, Globe, Captions, File, Quote, ShieldCheck, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-grid">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-display text-lg font-semibold">
          <Sparkles className="h-5 w-5 text-primary" />
          Index
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-20 pt-16 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          Every answer traces back to a source
        </span>
        <h1 className="mt-6 font-display text-4xl font-semibold leading-tight sm:text-5xl">
          Research notebooks, <span className="text-primary">grounded</span> in what you actually gave it.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
          Upload PDFs, websites, YouTube videos, and transcripts. Ask questions in plain language. Get answers cited
          down to the page, the timestamp, or the exact passage — never a guess dressed up as fact.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/sign-up">
            <Button size="lg">Create your first notebook</Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { icon: File, label: "PDF" },
            { icon: Globe, label: "Web link" },
            { icon: Youtube, label: "YouTube" },
            { icon: FileText, label: "Text" },
            { icon: Captions, label: "Transcript" },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card/50 py-6 text-sm text-muted-foreground">
              <s.icon className="h-5 w-5 text-primary" />
              {s.label}
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Feature icon={Layers} title="Isolated notebooks" desc="Every notebook keeps its own sources and its own vector index — nothing bleeds across projects." />
          <Feature icon={Quote} title="Inline citations" desc="Every claim in every answer links back to the exact chunk that produced it, with a live status trail from upload to indexed." />
          <Feature icon={ShieldCheck} title="No silent hallucination" desc="When your sources don't cover a question, Index says so instead of guessing." />
        </div>
      </section>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: typeof Layers; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-5">
      <Icon className="h-5 w-5 text-primary" />
      <h3 className="mt-3 font-display text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
