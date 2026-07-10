## Summary

<!-- Provide a concise description of the change and why it is needed. -->

## Testing Done

<!-- Describe what tests were run and their results. Include manual and automated testing. -->

- [ ] Unit tests pass (`pytest`)
- [ ] Integration tests pass (`pytest --integration`)
- [ ] Manual smoke test performed in staging
- [ ] Performance / load test completed (if applicable)

## Security Impact

<!-- Evaluate the security surface of this change. -->

- [ ] No security impact
- [ ] Adds / modifies auth or authorization logic
- [ ] Introduces new dependencies (reviewed for CVEs)
- [ ] Handles PII or sensitive data
- [ ] Changes to encryption, signing, or secret handling

**Risk level:** Low / Medium / High

**Mitigations:**

## Deployment Notes

<!-- Any configuration, migration, or rollout steps needed. -->

- [ ] Requires database migration (`alembic upgrade head`)
- [ ] Requires infrastructure change (Terraform / CloudFormation)
- [ ] Requires environment variable changes
- [ ] Requires feature flag
- [ ] No special deployment actions

**Rollback plan:**

## Checklist

- [ ] Code follows project conventions (lint, type-check, format)
- [ ] Unit tests added / updated for all new logic
- [ ] Documentation updated (if applicable)
- [ ] Security review completed (if applicable)
- [ ] PR targets the correct branch (`develop` for features, `main` for hotfixes)
