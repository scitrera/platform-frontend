import React from 'react';
import LazyLucideIcon from "../UI/LazyLucideIcon.jsx";
import {titleCase} from "../../lib/utils";

// Component displayed when no workspace is selected.
const SelectWorkspacePrompt = ({message, workspaceTitle = 'workspace'}) => {
    // TODO: potentially support an external JSX replacement for this?
    //          (it can be _placeholder like for apps, BUT... currently no apps are tied to null workspace,
    //              so that would require some adjustment...)
    return (

        <div className="min-h-[60vh] flex items-center justify-center">
            <div className="relative w-full max-w-3xl">
                {/* Soft background glow */}
                <div
                    className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-blue-20 to-indigo-50 blur-lg"></div>

                <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
                    <div className="px-8 py-10 sm:py-12">
                        {/* Icon header */}
                        <div className="flex items-center justify-center gap-3">
                                <span
                                    className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-blue-100">
                                    <LazyLucideIcon iconName="PanelLeft" className="h-6 w-6 text-blue-600"/>
                                </span>
                            <span
                                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-100">
                                    <LazyLucideIcon iconName="MousePointerClick" className="h-6 w-6 text-amber-600"/>
                                </span>
                            <span
                                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
                                    <LazyLucideIcon iconName="Sparkles" className="h-6 w-6 text-emerald-600"/>
                                </span>
                        </div>

                        {/* Title */}
                        <h2 className="mt-6 text-center text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                            Select a {workspaceTitle} to get started
                        </h2>
                        {message ?
                            <p className="mt-2 text-center text-slate-600">{message}</p> :
                            <p className="mt-2 text-center text-slate-600">
                                Choose a {workspaceTitle} from the sidebar on the left. <br/>
                                We’ll load your {workspaceTitle} with the right tools and data.
                            </p>
                        }

                        {/* Subtle hint row with animation */}
                        <div className="mt-8 flex items-center justify-center gap-3 text-slate-500">
                            <LazyLucideIcon iconName="ArrowLeft" className="h-5 w-5 text-slate-800 animate-pulse"/>
                            <span className="text-sm">{titleCase(workspaceTitle)}s are listed in the left panel</span>
                        </div>

                        {/* Decorative bottom accent */}
                        <div
                            className="mt-10 h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent"/>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SelectWorkspacePrompt;