/**
 * Why: the page used to be 84 words, which is not enough for a search engine to
 * tell what it is about, and not enough for a reader either — the demo shows the
 * product working but never says what it is for.
 *
 * Every number and platform name here is checkable in the repository rather than
 * chosen for effect: the agent count is the TuiAgent union in
 * @yiru/workbench-model, the review platforms are HostedReviewCreationProvider,
 * the hosts are what the runtime clients route to.
 */
const sections = [
  {
    heading: 'One worktree per task',
    body: 'Two agents editing the same checkout overwrite each other, and a half-finished change makes the next task start from a dirty tree. Yiru gives each task its own git worktree, with its own files, terminal state and history, so several agents can work at once and you compare the results before anything merges.'
  },
  {
    heading: 'Thirty-five agents, as themselves',
    body: 'Claude Code, Codex, Gemini CLI, Copilot CLI, Cursor, Aider, Amp, OpenCode, Goose, Cline, Continue, Factory Droid, Grok and twenty-two more run as the terminal programs they already are. Yiru starts, monitors and resumes their sessions and keeps provider-specific behaviour isolated, so your authentication, model access and usage limits stay where they were.'
  },
  {
    heading: 'Wherever the code actually lives',
    body: 'A workspace runs on your own machine, inside a WSL distribution, over SSH, or through a relay-connected host. Filesystem, git, terminal and search operations are routed to whichever host owns the worktree, and cached host state never leaks between them — so a repository that only exists on a build box is still a normal workspace.'
  },
  {
    heading: 'Review the evidence, then merge',
    body: 'Read the diff, annotate individual lines to queue follow-up work, inspect checks, and open or read pull requests on GitHub, GitLab, Azure DevOps and Gitea. The iOS and Android companions pair with the desktop app for the same review and merge, for the part of the loop that happens away from the desk.'
  }
]

export function Capabilities(): React.JSX.Element {
  return (
    <>
      {sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h2 className="text-ink text-[17px] leading-[1.4] font-semibold">{section.heading}</h2>
          <p className="max-w-[620px]">{section.body}</p>
        </section>
      ))}
    </>
  )
}
