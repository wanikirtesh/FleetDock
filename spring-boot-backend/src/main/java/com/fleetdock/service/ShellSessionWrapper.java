package com.fleetdock.service;

import java.util.HashMap;
import java.util.Map;

/**
 * Makes one-shot command executions behave like consecutive turns of an interactive shell:
 * each command starts in the previous working directory and reports back the new directory and real exit code.
 */
public final class ShellSessionWrapper {

    private static final String CWD_MARKER = "__FD_CWD__";
    private static final String RC_MARKER = "__FD_RC__";

    private ShellSessionWrapper() {}

    public static String quote(String value) {
        return "'" + value.replace("'", "'\\''") + "'";
    }

    public static String wrap(String command, String cwd) {
        StringBuilder script = new StringBuilder("exec 2>&1; ");
        if (cwd != null && !cwd.isBlank()) {
            script.append("cd ").append(quote(cwd.trim())).append(" 2>/dev/null; ");
        }
        script.append(command)
                .append("\n__fd_rc=$?; printf '\\n").append(CWD_MARKER).append("%s\\n").append(RC_MARKER)
                .append("%s\\n' \"$(pwd)\" \"$__fd_rc\"");
        return script.toString();
    }

    /** Splits wrapped output into the visible output, the new working directory and the exit code. */
    public static Map<String, Object> parse(String rawOutput, String previousCwd) {
        Map<String, Object> result = new HashMap<>();
        int idx = rawOutput.lastIndexOf("\n" + CWD_MARKER);
        if (idx < 0) {
            result.put("output", rawOutput);
            result.put("exitCode", 1);
            if (previousCwd != null) result.put("cwd", previousCwd);
            return result;
        }

        String newCwd = previousCwd == null ? "" : previousCwd;
        int exitCode = 0;
        for (String line : rawOutput.substring(idx + 1).split("\n")) {
            if (line.startsWith(CWD_MARKER)) {
                newCwd = line.substring(CWD_MARKER.length());
            } else if (line.startsWith(RC_MARKER)) {
                try {
                    exitCode = Integer.parseInt(line.substring(RC_MARKER.length()).trim());
                } catch (NumberFormatException e) {
                    exitCode = 1;
                }
            }
        }
        String body = rawOutput.substring(0, idx);
        if (body.startsWith("[Process completed with exit code 0]")) {
            body = "";
        }
        result.put("output", body);
        result.put("exitCode", exitCode);
        result.put("cwd", newCwd);
        return result;
    }
}
