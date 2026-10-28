package com.fleetdock.controller;

import com.fleetdock.entity.VmHost;
import com.fleetdock.repository.VmHostRepository;
import com.fleetdock.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Requires a valid bearer token and restricts /hosts/{id}/** to the owning user. */
@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    public static final String USER_ID_ATTR = "fleetdock.userId";
    private static final Pattern HOST_PATH = Pattern.compile("^/api/v1/hosts/([^/]+)(/.*)?$");

    private final AuthService authService;
    private final VmHostRepository vmHostRepository;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;

        String header = request.getHeader("Authorization");
        String token = header != null && header.startsWith("Bearer ") ? header.substring(7).trim() : null;
        Optional<String> userId = authService.verify(token);
        if (userId.isEmpty()) {
            return reject(response, HttpServletResponse.SC_UNAUTHORIZED, "Authentication required");
        }
        request.setAttribute(USER_ID_ATTR, userId.get());

        Matcher m = HOST_PATH.matcher(request.getRequestURI());
        if (m.matches() && !"register".equals(m.group(1))) {
            Optional<VmHost> host = vmHostRepository.findById(m.group(1));
            if (host.isEmpty() || !userId.get().equals(host.get().getOwnerId())) {
                return reject(response, HttpServletResponse.SC_NOT_FOUND, "Host not found");
            }
        }
        return true;
    }

    private boolean reject(HttpServletResponse response, int status, String message) throws Exception {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
        return false;
    }
}
