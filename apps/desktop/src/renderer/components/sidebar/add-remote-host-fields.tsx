import { Input } from '~renderer/components/ui/input'
import { Label } from '~renderer/components/ui/label'
import { translate } from '~renderer/i18n/i18n'

export function RemoteServerFields({
  name,
  pairingCode,
  disabled,
  onNameChange,
  onPairingCodeChange,
  onSubmit
}: {
  name: string
  pairingCode: string
  disabled: boolean
  onNameChange: (value: string) => void
  onPairingCodeChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="add-server-name">
          {translate('auto.components.sidebar.AddRemoteHostDialog.serverName', 'Server name')}
        </Label>
        <Input
          id="add-server-name"
          value={name}
          disabled={disabled}
          autoFocus
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={translate(
            'auto.components.sidebar.AddRemoteHostDialog.serverNamePlaceholder',
            'Dev box'
          )}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-server-pairing-code">
          {translate('auto.components.sidebar.AddRemoteHostDialog.pairingCode', 'Pairing code')}
        </Label>
        <Input
          id="add-server-pairing-code"
          value={pairingCode}
          disabled={disabled}
          onChange={(event) => onPairingCodeChange(event.target.value)}
          placeholder={translate(
            'auto.components.sidebar.AddRemoteHostDialog.pairingCodePlaceholder',
            'yiru://pair?code=...'
          )}
          className="font-mono"
        />
        <p className="text-muted-foreground text-xs">
          {translate('auto.components.sidebar.AddRemoteHostDialog.pairingHelpPrefix', 'Run')}{' '}
          <span className="font-mono">
            {translate(
              'auto.components.sidebar.AddRemoteHostDialog.pairingCommand',
              'yiru serve --pairing-address <host>'
            )}
          </span>{' '}
          {translate(
            'auto.components.sidebar.AddRemoteHostDialog.pairingHelpSuffix',
            'on the server and paste the printed pairing URL.'
          )}
        </p>
      </div>
    </form>
  )
}
