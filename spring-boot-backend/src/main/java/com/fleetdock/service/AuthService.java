package com.fleetdock.service;

import com.fleetdock.entity.AppUser;
import com.fleetdock.repository.AppUserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

    private static final long TOKEN_TTL_SECONDS = 12L * 60 * 60;

    private final AppUserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final byte[] secret;

    public AuthService(AppUserRepository userRepository,
                       @Value("${fleetdock.security.jwt-secret}") String secret) {
        this.userRepository = userRepository;
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public AppUser register(String username, String password) {
        String name = normalize(username);
        if (name.length() < 3) throw new IllegalArgumentException("Username must be at least 3 characters");
        if (password == null || password.length() < 8) {
            throw new IllegalArgumentException("Password must be at least 8 characters");
        }
        if (userRepository.findByUsername(name).isPresent()) {
            throw new IllegalArgumentException("Username already taken");
        }
        return userRepository.save(AppUser.builder()
                .id("usr-" + UUID.randomUUID().toString().substring(0, 12))
                .username(name)
                .passwordHash(passwordEncoder.encode(password))
                .createdAt(LocalDateTime.now())
                .build());
    }

    public AppUser authenticate(String username, String password) {
        AppUser user = userRepository.findByUsername(normalize(username)).orElse(null);
        if (user == null || password == null || !passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new SecurityException("Invalid username or password");
        }
        return user;
    }

    public Map<String, Object> session(AppUser user) {
        long exp = System.currentTimeMillis() / 1000 + TOKEN_TTL_SECONDS;
        String payload = user.getId() + ":" + exp;
        String encoded = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return Map.of(
                "token", encoded + "." + sign(encoded),
                "expiresAt", exp * 1000,
                "user", Map.of("id", user.getId(), "username", user.getUsername()));
    }

    /** Returns the user id for a valid, unexpired token. */
    public Optional<String> verify(String token) {
        try {
            if (token == null) return Optional.empty();
            int dot = token.indexOf('.');
            if (dot < 1) return Optional.empty();
            String encoded = token.substring(0, dot);
            if (!MessageDigest.isEqual(sign(encoded).getBytes(StandardCharsets.UTF_8),
                    token.substring(dot + 1).getBytes(StandardCharsets.UTF_8))) {
                return Optional.empty();
            }
            String[] parts = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8).split(":");
            if (parts.length != 2 || Long.parseLong(parts[1]) < System.currentTimeMillis() / 1000) {
                return Optional.empty();
            }
            return userRepository.existsById(parts[0]) ? Optional.of(parts[0]) : Optional.empty();
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public Optional<AppUser> findById(String id) {
        return userRepository.findById(id);
    }

    private String sign(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String normalize(String username) {
        return username == null ? "" : username.trim().toLowerCase();
    }
}
