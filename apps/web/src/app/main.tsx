// Why: the client package marks only its stylesheet as side-effectful, so a static
// import of this self-executing bootstrap is pruned from a multi-entry production build.
void import('@yiru/client/web-bootstrap')
