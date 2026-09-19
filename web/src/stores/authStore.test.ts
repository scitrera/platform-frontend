import {beforeEach, describe, expect, it} from 'vitest';
import {useAuthStore} from './authStore';
import type {UserProfile} from '@/types/state';

function profile(tenant: string, uiConfig: Record<string, unknown> = {}): UserProfile {
    return {id: 'alice', name: 'Alice', email: 'alice@example.test', tenant,
        tenants: ['alpha', 'beta'], uiConfig,
        permissions: {isTenantAdmin: false, isSuperAdmin: false, canCreateWorkspaces: false}};
}

describe('tenant UI configuration', () => {
    beforeEach(() => useAuthStore.setState(useAuthStore.getInitialState()));

    it('defaults profile selection off and accepts an explicit tenant opt-in', () => {
        expect(useAuthStore.getState().uiConfig.enableWorkProfileSelection).toBe(false);
        useAuthStore.getState().setUserProfile(profile('alpha', {enableWorkProfileSelection: true}));
        expect(useAuthStore.getState().uiConfig.enableWorkProfileSelection).toBe(true);
    });

    it('resets a fixed theme and hidden toggle when the tenant policy is removed', () => {
        const {setUserProfile} = useAuthStore.getState();
        setUserProfile(profile('alpha', {forcedTheme: 'light', showThemeToggle: false}));
        expect(useAuthStore.getState().uiConfig).toMatchObject({forcedTheme: 'light', showThemeToggle: false});
        setUserProfile(profile('beta'));
        expect(useAuthStore.getState().uiConfig).toMatchObject({forcedTheme: null, showThemeToggle: true});
        setUserProfile(profile('beta', {forcedTheme: 'dark', showThemeToggle: false}));
        setUserProfile(profile('beta'));
        expect(useAuthStore.getState().uiConfig).toMatchObject({forcedTheme: null, showThemeToggle: true});
    });

    it('does not carry a tenant opt-in into another tenant or retain a removed override', () => {
        const {setUserProfile} = useAuthStore.getState();
        setUserProfile(profile('alpha', {enableWorkProfileSelection: true, workspaceHomedThreads: true}));
        setUserProfile(profile('beta'));
        expect(useAuthStore.getState().uiConfig.enableWorkProfileSelection).toBe(false);
        expect(useAuthStore.getState().uiConfig.workspaceHomedThreads).toBe(false);
        setUserProfile(profile('alpha', {enableWorkProfileSelection: true}));
        setUserProfile(profile('alpha'));
        expect(useAuthStore.getState().uiConfig.enableWorkProfileSelection).toBe(false);
    });
});
