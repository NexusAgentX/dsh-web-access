let epoch = 0

export function providerConfigEpoch(): number {
  return epoch
}

export function invalidateProviderConfigs(): void {
  epoch += 1
}
