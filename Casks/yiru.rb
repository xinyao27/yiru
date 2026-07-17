cask "yiru" do
  arch arm: "arm64", intel: "x64"

  version "1.3.24"
  sha256 arm:   "fc707f290ff3b631b7b7947bf339885b61a43d2e89475997c125b61268ed4966",
         intel: "5f677c13a08f7a5740442e29d388285a86488c8c1f7aa5f10a8721a2c6ede8e4"

  url "https://github.com/xinyao27/yiru/releases/download/v#{version}/yiru-macos-#{arch}.dmg",
      verified: "github.com/xinyao27/yiru/"
  name "Yiru"
  desc "IDE for orchestrating AI coding agents across terminals and worktrees"
  homepage "https://onyiru.dev/"

  livecheck do
    url :url
    strategy :github_latest
  end

  # Why: electron-updater (src/main/updater.ts) handles in-place updates by
  # writing a new Yiru.app into /Applications. Marking the cask auto_updates
  # tells Homebrew not to compete with the in-app updater — `brew upgrade`
  # becomes a no-op unless the user passes --greedy, and brew's version
  # metadata stays aligned with whatever the app has swapped itself to.
  auto_updates true
  conflicts_with cask: "yiru@rc"
  depends_on macos: :big_sur

  app "Yiru.app"

  binary "#{appdir}/Yiru.app/Contents/Resources/bin/yiru"

  zap trash: [
    "~/.yiru",
    "~/Library/Application Support/Yiru",
    "~/Library/Caches/com.stablyai.yiru",
    "~/Library/Caches/com.stablyai.yiru.ShipIt",
    "~/Library/HTTPStorages/com.stablyai.yiru",
    "~/Library/Preferences/com.stablyai.yiru.plist",
    "~/Library/Saved Application State/com.stablyai.yiru.savedState",
  ]
end
