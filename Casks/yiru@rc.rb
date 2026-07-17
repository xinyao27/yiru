cask "yiru@rc" do
  arch arm: "arm64", intel: "x64"

  version "1.4.36-rc.3"
  sha256 arm:   "563b6b14323fc9d5489299c82442d514bc12cabffc9d06d3964ed572af4b3955",
         intel: "457088c7021f07de1a419197f7b2bd00092741ad4727d4fef3d86af38a6831e7"

  url "https://github.com/stablyai/yiru/releases/download/v#{version}/yiru-macos-#{arch}.dmg",
      verified: "github.com/stablyai/yiru/"
  name "Yiru RC"
  desc "IDE for orchestrating AI coding agents across terminals and worktrees"
  homepage "https://onyiru.dev/"

  livecheck do
    url "https://github.com/stablyai/yiru"
    regex(/^v?(\d+(?:\.\d+)+-rc\.\d+)$/i)
    strategy :github_releases do |json, regex|
      json.map do |release|
        next if release["draft"]
        next unless release["prerelease"]

        match = release["tag_name"]&.match(regex)
        next if match.blank?

        match[1]
      end
    end
  end

  # Why: RC installs should follow Yiru's prerelease-aware updater instead of
  # waiting for Homebrew metadata churn between frequent release candidates.
  auto_updates true
  conflicts_with cask: "yiru"
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
