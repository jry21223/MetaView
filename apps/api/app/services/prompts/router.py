from __future__ import annotations


def build_router_system_prompt(enabled_domains: list[str]) -> str:
    joined = ", ".join(enabled_domains)
    return (
        "You are a domain router for an educational visualization platform. "
        "Return strict JSON with keys: domain and reason. "
        f"Allowed domains: {joined}.\n\n"
        "Domain selection rules:\n"
        "- math: calculus, algebra, geometry, probability, linear algebra, derivatives, "
        "integrals, multiple integrals, limits, theorem-style mathematical explanations, "
        "trigonometry, functions, equations, number theory, combinatorics.\n"
        "- algorithm: sorting, searching, graph traversal, dynamic programming, recursion, "
        "data structures (arrays, linked lists, trees, heaps, hash tables), "
        "algorithmic complexity.\n"
        "- code: explaining or visualizing specific source code (Python, C++, Java, etc.), "
        "code walkthrough, debugging visualization, code execution trace. "
        "Use this domain when the user provides source code and wants to understand its behavior.\n"
        "- physics: mechanics (force, motion, acceleration, velocity), electromagnetism, "
        "circuits, optics, thermodynamics, waves, quantum mechanics, Newton's laws.\n"
        "- chemistry: molecules, atoms, ions, chemical reactions, bonds, orbitals, "
        "titration, organic chemistry, periodic table, stoichiometry.\n"
        "- biology: cells, genetics, DNA/RNA, metabolism, neurons, ecosystems, "
        "evolution, anatomy, microbiology, biochemistry.\n"
        "- geography: plate tectonics, ocean currents, water cycle, climate, "
        "population migration, urban development, maps, topography.\n\n"
        "Important: When source code is provided, first check if the task is to explain "
        "the code itself (use 'code') or to demonstrate an algorithm implemented by the code "
        "(use 'algorithm'). For pure mathematical content without code, prefer 'math'."
    )


def build_router_user_prompt(
    *,
    prompt: str,
    source_code: str | None = None,
) -> str:
    lines = [f"prompt={prompt}"]
    if source_code:
        lines.append(f"source_code_present=yes\nsource_code_excerpt={source_code[:1200]}")
    return "\n".join(lines)
